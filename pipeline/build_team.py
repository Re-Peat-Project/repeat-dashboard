"""Add the team's whole-KHG runs to the dashboard data as DEM variants.

    python build_team.py --khg 16.02.01     # one KHG (repeat for several)
    python build_team.py --all              # every KHG listed in team_runs.yaml
    python build_team.py --all --force

Run it after build_khg.py / build_all.py: it reads ${REPEAT_KHG}/from_team (files named in team_runs.yaml), writes
<out>/khg/<code>/vector/<variant>/ and raster/<variant>/, and adds the variant to that KHG's manifest.json and to catalog.json.
Steps are cached by a hash of the source files. A layer a delivery does not have is listed under "missing" in the manifest.
"""
import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
import pyogrio
import rasterio
import yaml
from rasterio.enums import Resampling

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import build_khg as bk  # noqa: E402
import dem_tiles  # noqa: E402

TEAM = bk.KHG_ROOT / "from_team"
LAYERS = ["units", "sekat_proposed", "sekat_existing", "canal_segments"]
LAYER_ID = {"units": "subkhg_units"}   # dashboard layer id of each team layer
SOURCE = "Team run, earlier method (all sub-KHG processed)"


def percentiles(tif):
    """2nd and 98th percentile of the valid cells, from a decimated read (a display ramp only)."""
    with rasterio.open(tif) as src:
        step = max(1, int(max(src.width, src.height) / 2000))
        a = src.read(1, out_shape=(src.height // step, src.width // step), resampling=Resampling.nearest, masked=True)
        v = a.compressed()
        return float(np.percentile(v, 2)), float(np.percentile(v, 98)), float(src.res[0])


def build_variant(code, variant, spec, specs, labels, reg, out, cache, force, manifest):
    for lid in LAYERS:
        item = spec.get(lid)
        sid = LAYER_ID.get(lid, lid)
        base = specs[sid]
        label = {"en": "Sub-KHG units (all processed)", "id": "Unit sub-KHG (seluruhnya)"} if lid == "units" else base["label"]
        entry = {"id": sid, "group": base["group"], "label": label, "source": SOURCE, "dem": variant,
                 "file": f"vector/{variant}/{sid}.pmtiles"}
        if not item:
            manifest["missing"].append({**entry, "reason": "not in the delivery", "step": "team"})
            continue
        src = TEAM / item["path"]
        if not src.exists():
            manifest["missing"].append({**entry, "reason": f"{item['path']} not found", "step": "team"})
            continue
        layer = item.get("layer") or pyogrio.list_layers(src)[0][0]
        info = pyogrio.read_info(src, layer=layer)
        if not info["features"]:
            manifest["missing"].append({**entry, "reason": "layer is empty", "step": "team"})
            continue
        dst = out / entry["file"]
        key, fp = f"team:{variant}:{sid}", bk.fingerprint([src], extra=json.dumps([layer, bk.TIPPECANOE, base.get("maxzoom")]))
        if force or not cache.hit(key, fp, [dst]):
            gdf = bk.read_vector(src, layer, None)
            bk.tile_vector(gdf, sid, dst, base.get("maxzoom", 15))
            cache.put(key, fp)
            print(f"  vector {variant} {sid}: {len(gdf)} features, {bk.size_mb(dst)} MB", flush=True)
        manifest["vector"].append({**entry, "features": int(info["features"]), "mb": bk.size_mb(dst), "geometry": str(info["geometry_type"])})
    rel = {"id": "relief", "dem": variant}
    if not spec.get("dtm"):
        manifest["missing"].append({**rel, "reason": "no DTM in the delivery", "step": "team"})
        return
    tif = TEAM / spec["dtm"]
    if not tif.exists():
        manifest["missing"].append({**rel, "reason": f"{spec['dtm']} not found", "step": "team"})
        return
    dst = out / "raster" / variant / "relief.pmtiles"
    p02, p98, res = percentiles(tif)
    cap = reg.get("raster", {}).get(variant.split("_")[0], {}).get("max_zoom")
    key, fp = f"team:{variant}:relief", bk.fingerprint([tif], extra=f"{p02}:{p98}:{cap}")
    with rasterio.open(tif) as src:
        native = dem_tiles.native_zoom(src)
    zfile = dst.with_suffix(".zoom")
    if force or not cache.hit(key, fp, [dst, zfile]):
        zmax = min(native, cap or native)
        while True:
            mb = dem_tiles.build(str(tif), str(dst), "relief", p02, p98, 30.0, 6, zmax)
            if mb <= bk.FILE_LIMIT_MB or zmax <= 8:
                break
            print(f"  {mb:.0f} MB is over {bk.FILE_LIMIT_MB} MB; rebuilding at zoom {zmax - 1}", flush=True)
            zmax -= 1
        zfile.write_text(str(zmax))
        cache.put(key, fp)
        print(f"  raster {variant}: {bk.size_mb(dst)} MB", flush=True)
    zmax = int(zfile.read_text())
    manifest["raster"].append({**rel, "file": dst.relative_to(out).as_posix(), "mb": bk.size_mb(dst), "native_zoom": native, "max_zoom": zmax,
                               "zoom_capped": zmax < native, "source": spec["dtm"], "res_m": res, "z_range": [p02, p98],
                               "note": f"DEM identified by {spec['dem_basis']}"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--khg", action="append", default=[])
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--out", default=str(bk.OUT_DEFAULT))
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    team = yaml.safe_load((HERE / "team_runs.yaml").read_text(encoding="utf-8"))
    reg = yaml.safe_load((HERE / "layers.yaml").read_text(encoding="utf-8"))
    specs = {s["id"]: s for s in reg["vector"]}
    codes = list(team["khg"]) if a.all else a.khg
    if not codes:
        raise SystemExit("give --khg CODE or --all")
    out_root = Path(a.out)
    catalog = json.loads((out_root / "catalog.json").read_text(encoding="utf-8"))
    for code in codes:
        variants = team["khg"].get(code)
        out = out_root / "khg" / code
        mfp = out / "manifest.json"
        if not variants or not mfp.exists():
            print(f"{code}: {'not in team_runs.yaml' if not variants else 'no manifest, run build_khg.py first'}")
            continue
        manifest = json.loads(mfp.read_text(encoding="utf-8"))
        gone = set(team["variants"])   # drop the team entries of an earlier run
        for sec in ("vector", "raster", "tables"):
            manifest[sec] = [e for e in manifest[sec] if e.get("dem") not in gone]
        manifest["missing"] = [m for m in manifest["missing"] if m.get("step") != "team"]
        manifest["dems"] = [d for d in manifest["dems"] if d not in gone]
        cache = bk.Cache(out / ".build_cache.json")
        print(f"KHG {code}: {list(variants)}", flush=True)
        for variant, spec in variants.items():
            build_variant(code, variant, spec, specs, team["variants"], reg, out, cache, a.force, manifest)
            manifest["dems"].append(variant)
        manifest["dem_labels"] = {v: team["variants"][v] for v in variants}
        mfp.write_text(json.dumps(bk.clean(manifest), indent=1, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        for c in catalog:
            if c["code"] == code:
                c["dems"] = [d for d in c["dems"] if d not in gone] + list(variants)
    (out_root / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
