"""Build the static data of one KHG for the dashboard.

    python build_khg.py --khg 16.02.01                 # all steps
    python build_khg.py --khg 16.02.01 --steps vector  # vector | points | tables | raster
    python build_khg.py --khg 16.02.01 --force

Reads only the KHG folder (_khg/<code>_<name>/), writes <out>/khg/<code>/ and manifest.json.
Steps are cached by a hash of their source files; a rerun skips what has not changed.
A KHG without a DEM variant, a layer or a table gets no file for it, and the manifest says so.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio
import rasterio
import rasterio.warp
import yaml

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import dem_tiles  # noqa: E402

WORK = HERE.parents[1]
KHG_ROOT = Path(os.environ.get("REPEAT_KHG", WORK / "_khg"))
OUT_DEFAULT = HERE.parent / "app" / "public" / "data"
IMAGE = "repeat-tippecanoe:2.79.0"
TIPPECANOE = ["--force", "-Z", "6", "-z", "15", "--no-feature-limit", "--no-tile-size-limit", "--no-tiny-polygon-reduction", "--buffer", "16"]
# VIIRS l/n/h and the KLH Indonesian levels, as low / medium / high; the page keeps medium and high apart
CONF = {"l": "low", "n": "medium", "h": "high", "low": "low", "medium": "medium", "high": "high",
        "rendah": "low", "sedang": "medium", "tinggi": "high"}
FILE_LIMIT_MB = 95   # GitHub rejects files over 100 MB; a pyramid over this is rebuilt one zoom lower, the native raster is untouched
DEMS = ["lidar", "deltadtm", "demnas"]


def resolve(kdir, src):
    """A path relative to the KHG folder, or ${REPEAT_DATA}/... for a national file."""
    if src.startswith("${REPEAT_DATA}/"):
        return Path(os.environ.get("REPEAT_DATA", WORK / "_data")) / src.split("/", 1)[1]
    return kdir / src


def khg_folder(code):
    hits = sorted(KHG_ROOT.glob(f"{code}_*"))
    if len(hits) != 1:
        raise SystemExit(f"KHG {code}: {len(hits)} folders in {KHG_ROOT}")
    return hits[0]


def fingerprint(paths, extra=""):
    h = hashlib.sha256(extra.encode())
    for p in sorted(map(Path, paths)):
        st = p.stat()
        h.update(f"{p.name}:{st.st_size}:{int(st.st_mtime)}".encode())
    return h.hexdigest()[:16]


class Cache:
    def __init__(self, path):
        self.path = path
        self.d = json.loads(path.read_text()) if path.exists() else {}

    def hit(self, key, fp, outputs):
        return self.d.get(key) == fp and all(Path(o).exists() for o in outputs)

    def put(self, key, fp):
        self.d[key] = fp
        self.path.write_text(json.dumps(self.d, indent=1))


def clean(o):
    """NaN and infinity are not valid JSON; write null."""
    if isinstance(o, float) and (o != o or o in (float("inf"), float("-inf"))):
        return None
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v) for v in o]
    return o


def size_mb(p):
    return round(Path(p).stat().st_size / 1e6, 3)


# vector ---------------------------------------------------------------------

def read_vector(path, layer, keep, drop=()):
    gdf = pyogrio.read_dataframe(path, layer=layer, force_2d=True)
    if gdf.crs is None:
        raise SystemExit(f"{path}: no CRS")
    gdf = gdf.to_crs(4326)
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty]
    cols = [c for c in (keep if keep is not None else gdf.columns) if c in gdf.columns and c != gdf.geometry.name and c not in drop]
    return gdf[cols + [gdf.geometry.name]]


# forest area function (Fungsi_KWS) to the classes of the national dashboard (national/overlay.py KWS_CLASSES)
FOREST_CLASS = {
    "Hutan Lindung": "hl", "Hutan Produksi Tetap": "prod", "Hutan Produksi Terbatas": "prod", "Hutan Produksi yang dapat di Konversi": "hpk",
    "Areal Penggunaan Lain": "apl", "Tubuh Air": "other", "Belum terdefinisi": "other",
    "Kawasan Suaka Alam/Kawasan Pelestarian Alam": "cons", "Suaka Margastwa": "cons", "Taman Nasional": "cons", "Hutan (Kawasan) Suaka Alam/Wisata": "cons", "Taman Hutan Raya": "cons",
}


def read_national_clip(path, khg_gpkg, keep, buffer_deg=0.05):
    """A national polygon layer clipped to the KHG boundary plus a buffer, so a tile holds only what is near the KHG."""
    area = read_vector(khg_gpkg, None, []).union_all().buffer(buffer_deg)
    info = pyogrio.read_info(path)
    box = gpd.GeoSeries([area], crs=4326).to_crs(info["crs"]).total_bounds
    gdf = pyogrio.read_dataframe(path, bbox=tuple(box), force_2d=True).to_crs(4326)
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty]
    gdf = gdf.clip(area)
    gdf = gdf[~gdf.geometry.is_empty]
    gdf["cls"] = gdf["Fungsi_KWS"].map(FOREST_CLASS).fillna("other")
    return gdf[[c for c in keep if c in gdf.columns] + [gdf.geometry.name]]


def tip_flags(maxzoom, minzoom=6):
    f = list(TIPPECANOE)
    f[f.index("-z") + 1] = str(maxzoom)
    f[f.index("-Z") + 1] = str(minzoom)
    return f


def tile_vector(gdf, name, out_path, maxzoom=15, minzoom=6):
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / f"{name}.geojsonl"
        gdf.to_file(src, driver="GeoJSONSeq")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        # tippecanoe writes SQLite; on a Windows bind mount that is about 25x slower, so build inside the container and copy out
        tip = " ".join(["tippecanoe", "-o", f"/tmp/{out_path.name}", *tip_flags(maxzoom, minzoom), "-L", f"{name}:/in/{src.name}"])
        cmd = ["docker", "run", "--rm", "--entrypoint", "sh", "-v", f"{Path(tmp).resolve()}:/in:ro",
               "-v", f"{out_path.parent.resolve()}:/out", IMAGE, "-c", f"{tip} && cp /tmp/{out_path.name} /out/"]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode:
            raise SystemExit(f"tippecanoe failed for {name}:\n{r.stderr[-800:]}")


def step_vector(kdir, out, reg, dems, cache, force, holder_names, manifest):
    for spec in reg["vector"]:
        variants = dems if spec.get("dem") else [None]
        for dem in variants:
            pattern = spec.get("national") or spec["src"].replace("{dem}", dem or "")
            srcs = [resolve(kdir, pattern)] if spec.get("national") else sorted(kdir.glob(pattern))
            srcs = [x for x in srcs if x.exists()]
            rel = Path("vector") / (dem or "") / f"{spec['id']}.pmtiles"
            key = f"vector:{dem or '-'}:{spec['id']}"
            entry = {"id": spec["id"], "group": spec["group"], "label": spec["label"], "source": spec["source"], "dem": dem,
                     "file": rel.as_posix()}
            if not srcs:
                manifest["missing"].append({**entry, "reason": f"no file for {pattern}", "step": "vector"})
                continue
            src = srcs[0]
            layer = spec.get("layer")
            if layer is None:
                layer = pyogrio.list_layers(src)[0][0]
            keep = spec.get("keep")
            if holder_names and spec.get("holder_field") and keep is not None:
                keep = [*keep, spec["holder_field"]]
            fp = fingerprint([src], extra=json.dumps([layer, keep, TIPPECANOE, spec.get("maxzoom"), "clip-v1" if spec.get("national") else ""]))
            dst = out / rel
            info = pyogrio.read_info(src, layer=layer)
            if not info["features"]:
                manifest["missing"].append({**entry, "reason": "layer is empty", "step": "vector"})
                continue
            if force or not cache.hit(key, fp, [dst]):
                gdf = read_national_clip(src, kdir / "00_inputs" / "khg.gpkg", keep) if spec.get("national") else read_vector(src, layer, keep)
                tile_vector(gdf, spec["id"], dst, spec.get("maxzoom", 15))
                cache.put(key, fp)
                print(f"  vector {dem or ''} {spec['id']}: {len(gdf)} features, {size_mb(dst)} MB", flush=True)
            manifest["vector"].append({**entry, "features": int(info["features"]), "mb": size_mb(dst), "geometry": str(info["geometry_type"])})


# points ----------------------------------------------------------------------

def step_points(kdir, out, reg, cache, force, manifest):
    for spec in reg["points"]:
        dst = out / "points" / f"{spec['id']}.parquet"
        files = [resolve(kdir, s_["src"]) for s_ in spec["sources"] if resolve(kdir, s_["src"]).exists()]
        if not files:
            manifest["missing"].append({"id": spec["id"], "reason": "no point sources", "step": "points"})
            continue
        peat = kdir / spec["peat"] if spec.get("peat") else None
        fp = fingerprint(files + ([peat] if peat and peat.exists() else []))
        key = f"points:{spec['id']}"
        if not force and cache.hit(key, fp, [dst]):
            manifest["points"].append({"id": spec["id"], "file": dst.relative_to(out).as_posix(), "mb": size_mb(dst)})
            continue
        frames = []
        khg_poly = read_vector(kdir / "00_inputs" / "khg.gpkg", None, []).union_all()
        for s_ in spec["sources"]:
            p = resolve(kdir, s_["src"])
            if not p.exists():
                continue
            g = pyogrio.read_dataframe(p, force_2d=True, bbox=tuple(khg_poly.buffer(0.05).bounds)).to_crs(4326)
            g = g[g.intersects(khg_poly.buffer(0.045))]    # KHG plus about 5 km, as the other clips
            conf = g[s_["conf"]].astype("string").str.strip().str.lower().map(CONF).astype("string")
            d = pd.to_datetime(g[s_["date"]], errors="coerce")
            ym = d.dt.year * 100 + d.dt.month
            if s_.get("month"):   # rows with a month but no day (KLH 2026) keep the month and a null date
                ym = ym.fillna(s_["month_year"] * 100 + g[s_["month"]])
            df = pd.DataFrame({"lon": g.geometry.x.astype("float32"), "lat": g.geometry.y.astype("float32"),
                               "date": d.dt.date.astype("string"), "ym": ym.astype("Int32"),
                               "conf": conf, "frp": pd.to_numeric(g[s_["frp"]], errors="coerce").astype("float32"),
                               "kind": s_["kind"]})
            frames.append(df)
        df = pd.concat(frames, ignore_index=True).dropna(subset=["ym"]).sort_values(["ym", "date"]).reset_index(drop=True)
        df["ym"] = df["ym"].astype("int32")
        if peat is not None and peat.exists():
            with rasterio.open(peat) as r:
                xs, ys = rasterio.warp.transform("EPSG:4326", r.crs, df.lon.astype(float).tolist(), df.lat.astype(float).tolist())
                vals = np.array([v[0] for v in r.sample(zip(xs, ys))])
                df["peat"] = vals == 1       # 0 non-peat, 1 peat, 255 outside the raster
        dst.parent.mkdir(parents=True, exist_ok=True)
        df.to_parquet(dst, index=False, compression="zstd")
        cache.put(key, fp)
        print(f"  points {spec['id']}: {len(df)} rows, {size_mb(dst)} MB", flush=True)
        manifest["points"].append({"id": spec["id"], "file": dst.relative_to(out).as_posix(), "mb": size_mb(dst), "rows": len(df),
                                   "label": spec["label"], "source": spec["source"],
                                   "kinds": {k: int(v) for k, v in df.kind.value_counts().items()},
                                   "undated": int(df["date"].isna().sum()), "note": "rows without a date carry only the month (ym)"})


# tables ----------------------------------------------------------------------

TABLES = [
    # (id, source pattern relative to KHG folder, per DEM)
    ("subkhg_priority", "04_prioritisation/{dem}/unit_prioritas.csv", True),
    ("sekat_need", "04_prioritisation/{dem}/kebutuhan_sekat.csv", True),
    ("pump_budget", "05_pump/{dem}/budget.csv", True),
    ("pump_interventions", "05_pump/{dem}/interventions.csv", True),
    ("sitmat_stations", "00_inputs/sitmat/stations_geo.csv", False),
    ("sitmat_daily", "00_inputs/sitmat/daily_long.csv", False),
]


def step_tables(kdir, out, dems, cache, force, manifest):
    for tid, pattern, per_dem in TABLES:
        for dem in (dems if per_dem else [None]):
            src = kdir / pattern.replace("{dem}", dem or "")
            dst = out / "tables" / (dem or "") / f"{tid}.parquet"
            if not src.exists() and per_dem and dem:  # runs made before DEM variants sit directly in the step folder
                alt = kdir / pattern.replace("/{dem}", "")
                if alt.exists() and dem == "lidar":
                    src = alt
            if not src.exists():
                manifest["missing"].append({"id": tid, "dem": dem, "reason": f"no file {pattern}", "step": "tables"})
                continue
            key, fp = f"table:{dem or '-'}:{tid}", fingerprint([src])
            if force or not cache.hit(key, fp, [dst]):
                df = pd.read_csv(src, low_memory=False)
                dst.parent.mkdir(parents=True, exist_ok=True)
                df.to_parquet(dst, index=False, compression="zstd")
                cache.put(key, fp)
                print(f"  table {dem or ''} {tid}: {len(df)} rows", flush=True)
            manifest["tables"].append({"id": tid, "dem": dem, "file": dst.relative_to(out).as_posix(), "mb": size_mb(dst)})


# raster ----------------------------------------------------------------------

def step_raster(kdir, out, reg, dems, cache, force, manifest):
    mf = kdir / "01_dem" / "inputs" / "manifest.csv"
    if not mf.exists():
        manifest["missing"].append({"id": "dem", "reason": "no 01_dem/inputs/manifest.csv", "step": "raster"})
        return
    m = pd.read_csv(mf)
    for dem in DEMS:
        rows = m[m["product"].str.startswith(dem)]
        if rows.empty:
            manifest["missing"].append({"id": f"relief_{dem}", "dem": dem, "reason": "no clip in 01_dem/inputs", "step": "raster"})
            continue
        row = rows.sort_values("cover_pct", ascending=False).iloc[0]   # the clip with the widest cover
        if pd.isna(row["file"]):
            manifest["missing"].append({"id": f"relief_{dem}", "dem": dem, "reason": "no clip file in 01_dem/inputs/manifest.csv", "step": "raster"})
            continue
        tif = kdir / "01_dem" / "inputs" / row["file"]
        if not tif.exists():
            manifest["missing"].append({"id": f"relief_{dem}", "dem": dem, "reason": f"{row['file']} not found", "step": "raster"})
            continue
        dst = out / "raster" / dem / "relief.pmtiles"
        fp = fingerprint([tif], extra=f"{row.z_p02}:{row.z_p98}:{reg.get('raster', {}).get(dem, {}).get('max_zoom')}")
        key = f"raster:{dem}:relief"
        with rasterio.open(tif) as src:
            native = dem_tiles.native_zoom(src)
        zcap_file = dst.with_suffix(".zoom")
        if force or not cache.hit(key, fp, [dst, zcap_file]):
            zmax = min(native, reg.get("raster", {}).get(dem, {}).get("max_zoom", native))
            while True:
                mb = dem_tiles.build(str(tif), str(dst), "relief", float(row.z_p02), float(row.z_p98), 30.0, 6, zmax)
                if mb <= FILE_LIMIT_MB or zmax <= 8:
                    break
                print(f"  {mb:.0f} MB is over {FILE_LIMIT_MB} MB; rebuilding at zoom {zmax - 1}", flush=True)
                zmax -= 1
            zcap_file.write_text(str(zmax))
            cache.put(key, fp)
        zmax = int(zcap_file.read_text())
        manifest["raster"].append({"id": "relief", "dem": dem, "file": dst.relative_to(out).as_posix(), "mb": size_mb(dst),
                                   "native_zoom": native, "max_zoom": zmax, "zoom_capped": zmax < native,
                                   "source": row["file"], "res_m": float(row.res_m), "cover_pct": float(row.cover_pct),
                                   "z_range": [float(row.z_p02), float(row.z_p98)], "note": row.get("note")})


# neraca air: climatic balance per sub-KHG, KHG deficit, groundwater model ----------

GW_FIELDS = [   # (file, id, (vmin, vmax or None for the season length), label en, label id)
    ("model_season_mean_depth.tif", "season_mean_depth", (0, 100), "Mean water-table depth, dry season (cm)", "Kedalaman muka air rata-rata, musim kering (cm)"),
    ("model_season_days_deeper_40cm.tif", "days_deeper_40cm", (0, None), "Days deeper than 40 cm in the dry season", "Hari lebih dalam dari 40 cm pada musim kering"),
    ("model_depth_end.tif", "depth_end", (0, 150), "Water-table depth at the end of the run (cm)", "Kedalaman muka air di akhir simulasi (cm)"),
]


def to_parquet(src, dst):
    df = pd.read_csv(src, low_memory=False)
    dst.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(dst, index=False, compression="zstd")
    return df


def step_neraca(kdir, out, reg, dems, cache, force, manifest):
    nd = kdir / "03_neraca"
    # KHG level deficit (station based), shared by the DEM variants
    for name, rel in [("deficit_khg", "runs/deficit/neraca_khg.csv"), ("deficit_series", "runs/deficit/tier1_series.csv")]:
        src = nd / rel
        if not src.exists():
            manifest["missing"].append({"id": name, "reason": f"no file 03_neraca/{rel}", "step": "neraca"})
            continue
        dst = out / "tables" / f"{name}.parquet"
        key, fp = f"neraca:{name}", fingerprint([src])
        if force or not cache.hit(key, fp, [dst]):
            to_parquet(src, dst)
            cache.put(key, fp)
        manifest["tables"].append({"id": name, "dem": None, "file": dst.relative_to(out).as_posix(), "mb": size_mb(dst)})
    runs = reg.get("groundwater", {}).get("runs", [])
    for dem in dems:
        bal = nd / dem / "runs" / "balance"
        if not bal.exists():
            manifest["missing"].append({"id": "balance", "dem": dem, "reason": f"no 03_neraca/{dem}/runs/balance", "step": "neraca"})
        for name, f in [("balance_unit", "neraca_balance_unit.csv"), ("balance_monthly", "neraca_balance_monthly.csv")]:
            src = bal / f
            if not src.exists():
                continue
            dst = out / "tables" / dem / f"{name}.parquet"
            key, fp = f"neraca:{dem}:{name}", fingerprint([src])
            if force or not cache.hit(key, fp, [dst]):
                to_parquet(src, dst)
                cache.put(key, fp)
            manifest["tables"].append({"id": name, "dem": dem, "file": dst.relative_to(out).as_posix(), "mb": size_mb(dst)})
        gpkg = bal / "neraca_map.gpkg"
        for layer, label in [("neraca_units", {"en": "Climatic balance per sub-KHG", "id": "Neraca iklim per sub-KHG"}),
                             ("neraca_stations", {"en": "Water-table stations", "id": "Stasiun muka air"})]:
            if not gpkg.exists():
                break
            if layer not in [n for n, _ in pyogrio.list_layers(gpkg)]:
                manifest["missing"].append({"id": layer, "dem": dem, "reason": f"no layer {layer} in neraca_map.gpkg", "step": "neraca"})
                continue
            dst = out / "vector" / dem / f"{layer}.pmtiles"
            key, fp = f"neraca:{dem}:{layer}", fingerprint([gpkg])
            if force or not cache.hit(key, fp, [dst]):
                tile_vector(read_vector(gpkg, layer, None), layer, dst, 13)
                cache.put(key, fp)
            manifest["vector"].append({"id": layer, "group": "neraca", "label": label, "source": "repeat-neraca balance", "dem": dem,
                                       "file": dst.relative_to(out).as_posix(), "mb": size_mb(dst)})
        for run in runs:
            rdir = nd / dem / "runs" / "model" / run
            if not (rdir / "model_units.csv").exists():
                manifest["missing"].append({"id": f"model_{run}", "dem": dem, "reason": f"no groundwater run {run}", "step": "neraca"})
                continue
            cfg = json.loads((rdir / "run_config.json").read_text(encoding="utf-8"))
            base = out / "tables" / dem / "model" / run
            entry = {"dem": dem, "run": run, "res_m": cfg.get("res_m"), "start": cfg.get("start"), "end": cfg.get("end"),
                     "season": cfg.get("season"), "peat_table": cfg.get("peat_table"), "managed_target": cfg.get("managed_target"),
                     "rain": cfg.get("rain"), "et": cfg.get("et"), "canal_cells": cfg.get("canal_cells"),
                     "stage": reg["groundwater"].get("stage"), "files": [], "rasters": []}
            fp = fingerprint([f for f in [*rdir.glob("*.csv"), *rdir.glob("*.tif"), rdir / "run_config.json", rdir / "station_scores.json"] if f.exists()])
            key = f"neraca:{dem}:model:{run}"
            for fname in ["model_series", "model_units", "station_scores"]:
                if (rdir / f"{fname}.csv").exists():
                    dst = base / f"{fname}.parquet"
                    if force or not cache.hit(key, fp, [dst]):
                        to_parquet(rdir / f"{fname}.csv", dst)
                    entry["files"].append({"id": fname, "file": dst.relative_to(out).as_posix(), "mb": size_mb(dst)})
            sim = rdir / "station_sim_daily.csv"
            if sim.exists():
                dst = base / "station_sim.parquet"
                if force or not cache.hit(key, fp, [dst]):
                    long = pd.read_csv(sim).melt(id_vars="date", var_name="station_id", value_name="sim_cm")
                    long["sim_cm"] = long["sim_cm"].astype("float32").abs()    # the model writes -0.0 for a saturated cell
                    long.to_parquet(dst, index=False, compression="zstd")
                entry["files"].append({"id": "station_sim", "file": dst.relative_to(out).as_posix(), "mb": size_mb(dst)})
            sc = rdir / "station_scores.json"
            if sc.exists():
                entry["station_scores"] = json.loads(sc.read_text(encoding="utf-8"))
            units = pd.read_csv(rdir / "model_units.csv")
            season_days = int(units["season_days"].max()) if "season_days" in units else None
            for fname, fid, (lo, hi), en, idn in GW_FIELDS:
                tif = rdir / fname
                if not tif.exists():
                    continue
                hi = hi if hi is not None else season_days
                dst = out / "raster" / dem / "model" / run / f"{fid}.pmtiles"
                if force or not cache.hit(key + f":{fid}", fp, [dst]):
                    dem_tiles.build(str(tif), str(dst), "field", float(lo), float(hi), 1.0, 6, None)
                    cache.put(key + f":{fid}", fp)
                entry["rasters"].append({"id": fid, "file": dst.relative_to(out).as_posix(), "mb": size_mb(dst),
                                         "range": [lo, hi], "label": {"en": en, "id": idn}})
            cache.put(key, fp)
            manifest["groundwater"].append(entry)
            print(f"  groundwater {dem} {run}: {len(entry['files'])} tables, {len(entry['rasters'])} rasters", flush=True)


NERACA_IDS = {"neraca_units", "neraca_stations", "balance_unit", "balance_monthly", "deficit_khg", "deficit_series"}


def owned_by(section, entry, steps):
    """Which step wrote this manifest entry."""
    if entry.get("id") in NERACA_IDS:
        return "neraca" in steps
    return section in steps


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--khg", required=True, help="KHG code without the KHG. prefix, e.g. 16.02.01")
    ap.add_argument("--steps", default="vector,points,tables,raster,neraca")
    ap.add_argument("--out", default=str(OUT_DEFAULT))
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--holder-names", action="store_true", help="carry licence holder names into the tiles")
    a = ap.parse_args()
    kdir = khg_folder(a.khg)
    out = Path(a.out) / "khg" / a.khg
    out.mkdir(parents=True, exist_ok=True)
    reg = yaml.safe_load((HERE / "layers.yaml").read_text(encoding="utf-8"))
    dems = [d for d in DEMS if (kdir / "04_prioritisation" / d).is_dir() or (kdir / "01_dem" / "inputs" / f"{d}.tif").exists()]
    cache = Cache(out / ".build_cache.json")
    steps = set(a.steps.split(","))
    old = json.loads((out / "manifest.json").read_text(encoding="utf-8")) if (out / "manifest.json").exists() else {}
    reg_csv = pd.read_csv(Path(os.environ.get("REPEAT_HUB", WORK / "re-peat")) / "sites" / "khg_registry.csv")
    row = reg_csv[reg_csv["khg_code"] == f"KHG.{a.khg}"]
    bounds = [round(float(v), 5) for v in read_vector(kdir / "00_inputs" / "khg.gpkg", None, []).total_bounds]
    manifest = {"code": a.khg, "khg_id": f"KHG.{a.khg}", "name": str(row.iloc[0]["name"]) if len(row) else kdir.name,
                "province": str(row.iloc[0]["province"]) if len(row) else None, "bounds": bounds, "folder": kdir.name, "built": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "dems": dems, "vector": [], "points": [], "tables": [], "raster": [], "groundwater": [], "missing": []}
    if old:   # keep what the steps not run now produced; a step rebuilds its own entries
        # neraca adds vector and table entries too, so a partial run only keeps entries whose id it does not own
        for sec in ("vector", "points", "tables", "raster"):
            manifest[sec] = [e for e in old.get(sec, []) if not owned_by(sec, e, steps)]
        if "neraca" not in steps:
            manifest["groundwater"] = old.get("groundwater", [])
        manifest["missing"] = [m for m in old.get("missing", []) if m.get("step") not in steps]
    print(f"KHG {a.khg} ({kdir.name}), DEM variants: {dems}", flush=True)
    if "vector" in steps:
        step_vector(kdir, out, reg, dems, cache, a.force, a.holder_names, manifest)
    if "points" in steps:
        step_points(kdir, out, reg, cache, a.force, manifest)
    if "tables" in steps:
        step_tables(kdir, out, dems, cache, a.force, manifest)
    if "raster" in steps:
        step_raster(kdir, out, reg, dems, cache, a.force, manifest)
    if "neraca" in steps:
        step_neraca(kdir, out, reg, dems, cache, a.force, manifest)
    (out / "manifest.json").write_text(json.dumps(clean(manifest), indent=1, ensure_ascii=False, allow_nan=False), encoding="utf-8")
    total = sum(f.stat().st_size for f in out.rglob("*") if f.is_file() and f.name != ".build_cache.json") / 1e6
    print(f"done: {total:.1f} MB, {len(manifest['missing'])} layers or tables missing -> {out / 'manifest.json'}")


if __name__ == "__main__":
    main()
