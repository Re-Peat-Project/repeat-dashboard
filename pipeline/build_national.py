"""Build the national data of the dashboard.

    python build_national.py [--steps tables,geometry,tiles,sitmat,grid] [--force]

Reads the national profile outputs (re-peat/reports/national_profile) and the national hotspot layers in _data,
writes <out>/national/. Run the national profile first (repeat-national-profile, stage3, overlay, dashboard).
Steps are cached by a hash of their source files.
"""
import argparse
import json
import os
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio
import rasterio
from pyproj import Transformer

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_khg import Cache, OUT_DEFAULT, WORK, fingerprint, size_mb, tile_vector  # noqa: E402

REPORTS = Path(os.environ.get("REPEAT_WORK", WORK / "re-peat" / "reports")) / "national_profile"
DATA = Path(os.environ.get("REPEAT_DATA", WORK / "_data"))
SITMAT = Path(os.environ.get("SITMAT_PROCESSED", WORK / "repeat-sitmat" / "sitmat_out" / "processed"))
GRID_DEG = 0.1
GRID_ORIGIN = (94.0, -11.5)   # lon, lat of the grid's south-west corner
CONF = {"l": "low", "n": "medium", "h": "high", "low": "low", "medium": "medium", "high": "high"}


def csv_to_parquet(src, dst):
    df = pd.read_csv(src, low_memory=False)
    dst.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(dst, index=False, compression="zstd")
    return df


def step_tables(out, cache, force, manifest):
    jobs = [("khg", REPORTS / "operational" / "profile.csv"), ("yearly", REPORTS / "operational" / "yearly.csv"),
            ("stage3_profile", REPORTS / "stage3" / "stage3_profile.csv"), ("stage3_yearly", REPORTS / "stage3" / "stage3_yearly.csv"),
            ("land_summary", REPORTS / "land" / "land_summary.csv"), ("land_dmpg_villages", REPORTS / "land" / "land_dmpg_villages.csv"),
            ("overlay_summary", REPORTS / "stage3" / "overlay" / "overlay_summary.csv")]
    for name, src in jobs:
        dst = out / f"{name}.parquet"
        if not src.exists():
            manifest["missing"].append({"id": name, "reason": f"no file {src.name}"})
            continue
        key, fp = f"table:{name}", fingerprint([src])
        if force or not cache.hit(key, fp, [dst]):
            df = csv_to_parquet(src, dst)
            cache.put(key, fp)
            print(f"  {name}: {len(df)} rows", flush=True)
        manifest["tables"].append({"id": name, "file": dst.name, "mb": size_mb(dst)})
    # scoring inputs and the reference ranking the page checks its own scoring against
    src = REPORTS / "dashboard_data.json"
    dst = out / "scoring.json"
    key, fp = "scoring", fingerprint([src])
    if force or not cache.hit(key, fp, [dst]):
        D = json.loads(src.read_text(encoding="utf-8"))["data"]
        D.pop("geo")
        dst.write_text(json.dumps(D, separators=(",", ":")), encoding="utf-8")
        cache.put(key, fp)
    rep = REPORTS / "operational" / "report.json"
    if rep.exists():
        (out / "report.json").write_text(rep.read_text(encoding="utf-8"), encoding="utf-8")
    manifest["files"] += [{"id": "scoring", "file": "scoring.json", "mb": size_mb(dst)}]


def step_tiles(out, cache, force, manifest):
    src = REPORTS / "operational" / "profile.gpkg"
    dst = out / "khg_outlines.pmtiles"
    key, fp = "tiles:outlines", fingerprint([src], extra="z0-10")
    if force or not cache.hit(key, fp, [dst]):
        g = pyogrio.read_dataframe(src, force_2d=True).to_crs(4326)
        keep = [c for c in ["khg_id", "nama", "province", "island", "peringkat", "kelas", "skor_risiko", "confidence"] if c in g.columns]
        tile_vector(g[keep + ["geometry"]], "khg", dst, 10, 0)
        cache.put(key, fp)
        print(f"  outlines: {len(g)} KHG, {size_mb(dst)} MB", flush=True)
    manifest["files"].append({"id": "khg_outlines", "file": dst.name, "mb": size_mb(dst)})


def khg_polygons():
    return pyogrio.read_dataframe(REPORTS / "operational" / "profile.gpkg", columns=["khg_id"], force_2d=True).to_crs(4326)


def step_sitmat(out, cache, force, manifest):
    for name, f in [("sitmat_daily", "daily_long.csv"), ("sitmat_stations", "stations_geo.csv")]:
        src = SITMAT / f
        dst = out / f"{name}.parquet"
        if not src.exists():
            manifest["missing"].append({"id": name, "reason": f"no file {f}"})
            continue
        key, fp = f"table:{name}", fingerprint([src])
        if force or not cache.hit(key, fp, [dst]):
            df = pd.read_csv(src, low_memory=False)
            for c in df.columns:
                if df[c].dtype == "float64" and c not in ("lon", "lat"):
                    df[c] = df[c].astype("float32")
            if name == "sitmat_stations":   # the khg_id in this file is a row number of the boundary file: place each station by location instead
                xy = pd.read_csv(SITMAT / "stations.csv", usecols=["kind", "station_id", "lon", "lat"])
                df = df.merge(xy, on=["kind", "station_id"], how="left")
                pts = gpd.GeoDataFrame(df[["kind", "station_id"]], geometry=gpd.points_from_xy(df.lon, df.lat), crs=4326)
                j = gpd.sjoin(pts, khg_polygons(), how="left", predicate="within").drop_duplicates(["kind", "station_id"])
                df = df.merge(j[["kind", "station_id", "khg_id"]].rename(columns={"khg_id": "khg"}), on=["kind", "station_id"], how="left").drop(columns=["khg_id"])
                print(f"  stations inside a KHG: {int(df.khg.notna().sum())} of {len(df)}", flush=True)
            df.to_parquet(dst, index=False, compression="zstd")
            cache.put(key, fp)
            print(f"  {name}: {len(df)} rows", flush=True)
        manifest["tables"].append({"id": name, "file": dst.name, "mb": size_mb(dst)})


def peat_lookup():
    """Vectorised lookup of the GFW peat extent (EPSG:3857, 0 non-peat, 1 peat, 255 outside)."""
    path = DATA / "peat_extent_gfw_v20230315_z11.tif"
    with rasterio.open(path) as r:
        arr, t, crs = r.read(1), r.transform, r.crs
    tr = Transformer.from_crs(4326, crs, always_xy=True)

    def f(lon, lat):
        x, y = tr.transform(lon, lat)
        col = np.floor((x - t.c) / t.a).astype(int)
        row = np.floor((y - t.f) / t.e).astype(int)
        ok = (row >= 0) & (row < arr.shape[0]) & (col >= 0) & (col < arr.shape[1])
        out = np.zeros(len(x), bool)
        out[ok] = arr[row[ok], col[ok]] == 1
        return out
    return f


def step_grid(out, cache, force, manifest):
    srcs = [("viirs", DATA / "hotspot_viirs_snpp_2012_2025.gpkg", "acq_date", "confidence", "frp", None),
            ("viirs", DATA / "hotspot_viirs_snpp_sp_2026.gpkg", "acq_date", "confidence", "frp", None),
            ("viirs", DATA / "hotspot_viirs_snpp_nrt_2026.gpkg", "acq_date", "confidence", "frp", None),
            ("modis2026", DATA / "hotspots_modis_2026.gpkg", "acq_date", "level", "frp", ("month", 2026))]   # five KLH months carry a month, no day
    files = [x[1] for x in srcs if x[1].exists()] + [DATA / "peat_extent_gfw_v20230315_z11.tif"]
    dst = out / "hotspot_grid.parquet"
    key, fp = "grid", fingerprint(files, extra=f"{GRID_DEG}:{GRID_ORIGIN}")
    if not force and cache.hit(key, fp, [dst]):
        manifest["files"].append({"id": "hotspot_grid", "file": dst.name, "mb": size_mb(dst)})
        return
    peat = peat_lookup()
    parts = []
    for kind, path, dcol, ccol, fcol, mcol in srcs:
        if not path.exists():
            manifest["missing"].append({"id": f"grid_{kind}", "reason": f"no file {path.name}"})
            continue
        g = pyogrio.read_dataframe(path, columns=[dcol, ccol, fcol] + ([mcol[0]] if mcol else []), use_arrow=True)
        lon, lat = g.geometry.x.to_numpy(), g.geometry.y.to_numpy()
        d = pd.to_datetime(g[dcol], errors="coerce")
        conf = g[ccol].astype("string").str.strip().str.lower().map(CONF)
        df = pd.DataFrame({"ix": np.floor((lon - GRID_ORIGIN[0]) / GRID_DEG).astype("int16"),
                           "iy": np.floor((lat - GRID_ORIGIN[1]) / GRID_DEG).astype("int16"),
                           "ym": (d.dt.year * 100 + d.dt.month).fillna(mcol[1] * 100 + g[mcol[0]] if mcol else np.nan).astype("Int32"), "conf": conf, "peat": peat(lon, lat),
                           "frp": pd.to_numeric(g[fcol], errors="coerce").fillna(0).astype("float32"), "kind": kind})
        df = df.dropna(subset=["ym", "conf"])
        parts.append(df.groupby(["kind", "ix", "iy", "ym", "conf", "peat"], observed=True).agg(n=("frp", "size"), frp_sum=("frp", "sum")).reset_index())
        print(f"  grid {kind}: {len(g)} points -> {len(parts[-1])} cells", flush=True)
    grid = pd.concat(parts, ignore_index=True)
    for c in ("kind", "conf"):
        grid[c] = grid[c].astype("category")
    grid["ym"] = grid["ym"].astype("int32")
    grid["frp_sum"] = grid["frp_sum"].astype("float32")
    grid.to_parquet(dst, index=False, compression="zstd")
    cache.put(key, fp)
    manifest["files"].append({"id": "hotspot_grid", "file": dst.name, "mb": size_mb(dst), "rows": len(grid),
                              "grid": {"deg": GRID_DEG, "origin_lon": GRID_ORIGIN[0], "origin_lat": GRID_ORIGIN[1]},
                              "source": "VIIRS SNPP 2012-2026 (FIRMS); MODIS 2026 (KLH to 15 September, FIRMS NRT after)",
                              "peat_basis": "GFW composite peat extent"})
    print(f"  grid: {len(grid)} rows, {size_mb(dst)} MB", flush=True)


def step_khg_monthly(out, cache, force, manifest):
    """Hotspots per KHG, month, confidence and peat flag: every point is assigned to the KHG polygon it lies in."""
    srcs = [("viirs", DATA / "hotspot_viirs_snpp_2012_2025.gpkg", "acq_date", "confidence", "frp", None),
            ("viirs", DATA / "hotspot_viirs_snpp_sp_2026.gpkg", "acq_date", "confidence", "frp", None),
            ("viirs", DATA / "hotspot_viirs_snpp_nrt_2026.gpkg", "acq_date", "confidence", "frp", None),
            ("modis2026", DATA / "hotspots_modis_2026.gpkg", "acq_date", "level", "frp", ("month", 2026))]
    dst = out / "khg_hotspot_monthly.parquet"
    files = [x[1] for x in srcs if x[1].exists()] + [REPORTS / "operational" / "profile.gpkg", DATA / "peat_extent_gfw_v20230315_z11.tif"]
    key, fp = "khg_monthly", fingerprint(files)
    entry = {"id": "khg_hotspot_monthly", "file": dst.name}
    if not force and cache.hit(key, fp, [dst]):
        manifest["files"].append({**entry, "mb": size_mb(dst)})
        return
    polys, peat, parts = khg_polygons(), peat_lookup(), []
    for kind, path, dcol, ccol, fcol, mcol in srcs:
        if not path.exists():
            manifest["missing"].append({"id": f"khg_monthly_{kind}", "reason": f"no file {path.name}"})
            continue
        g = pyogrio.read_dataframe(path, columns=[dcol, ccol] + ([mcol[0]] if mcol else []), use_arrow=True)
        n_in = 0
        for lo in range(0, len(g), 500_000):
            sub_ = g.iloc[lo:lo + 500_000]
            j = gpd.sjoin(sub_[["geometry"]], polys, how="inner", predicate="within")   # a point on overlapping polygons counts in each
            if j.empty:
                continue
            n_in += len(j)
            rows = sub_.loc[j.index]
            lon, lat = rows.geometry.x.to_numpy(), rows.geometry.y.to_numpy()
            d = pd.to_datetime(rows[dcol], errors="coerce")
            ym = (d.dt.year * 100 + d.dt.month)
            if mcol:
                ym = ym.fillna(mcol[1] * 100 + rows[mcol[0]])
            df = pd.DataFrame({"khg_id": j["khg_id"].to_numpy(), "ym": ym.to_numpy(), "conf": rows[ccol].astype("string").str.strip().str.lower().map(CONF).to_numpy(),
                               "peat": peat(lon, lat), "kind": kind}).dropna(subset=["ym", "conf"])
            df["ym"] = df["ym"].astype("int32")
            parts.append(df.groupby(["khg_id", "kind", "ym", "conf", "peat"], observed=True).size().rename("n").reset_index())
        print(f"  khg monthly {kind}: {len(g)} points, {n_in} inside a KHG polygon", flush=True)
    t = pd.concat(parts, ignore_index=True).groupby(["khg_id", "kind", "ym", "conf", "peat"], observed=True)["n"].sum().reset_index()
    for c in ("khg_id", "kind", "conf"):
        t[c] = t[c].astype("category")
    t["n"] = t["n"].astype("int32")
    t.to_parquet(dst, index=False, compression="zstd")
    cache.put(key, fp)
    manifest["files"].append({**entry, "mb": size_mb(dst), "rows": len(t), "note": "points counted in every KHG polygon they lie in; peat from the GFW composite extent"})
    print(f"  khg monthly: {len(t)} rows, {size_mb(dst)} MB", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", default="tables,tiles,sitmat,grid,khgmonthly")
    ap.add_argument("--out", default=str(OUT_DEFAULT))
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    out = Path(a.out) / "national"
    out.mkdir(parents=True, exist_ok=True)
    cache = Cache(out / ".build_cache.json")
    steps = set(a.steps.split(","))
    mf = out / "manifest.json"
    manifest = {"tables": [], "files": [], "missing": []}
    if mf.exists():
        old = json.loads(mf.read_text(encoding="utf-8"))
        if "tables" not in steps and "sitmat" not in steps:
            manifest["tables"] = old.get("tables", [])
        keep_files = {"tiles": "khg_outlines", "grid": "hotspot_grid", "tables": None}
        manifest["files"] = [f for f in old.get("files", []) if not (("tables" in steps and f["id"] in ("scoring", "khg_geo")) or ("khgmonthly" in steps and f["id"] == "khg_hotspot_monthly") or
                             ("tiles" in steps and f["id"] == "khg_outlines") or ("grid" in steps and f["id"] == "hotspot_grid"))]
    if "tables" in steps:
        manifest["tables"] = [t for t in manifest["tables"] if t["id"].startswith("sitmat")]
        step_tables(out, cache, a.force, manifest)
    if "sitmat" in steps:
        manifest["tables"] = [t for t in manifest["tables"] if not t["id"].startswith("sitmat")]
        step_sitmat(out, cache, a.force, manifest)
    if "tiles" in steps:
        step_tiles(out, cache, a.force, manifest)
    if "grid" in steps:
        step_grid(out, cache, a.force, manifest)
    if "khgmonthly" in steps:
        step_khg_monthly(out, cache, a.force, manifest)
    mf.write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"done: {sum(f.stat().st_size for f in out.glob('*') if f.is_file()) / 1e6:.1f} MB, {len(manifest['missing'])} missing -> {mf}")


if __name__ == "__main__":
    main()
