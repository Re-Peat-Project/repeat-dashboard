"""National fire layers for the map of the National profile: app/public/data/national/

    python build_national_fire_tiles.py            # skips what has not changed
    python build_national_fire_tiles.py --force

  fire_hotspots_2026.pmtiles   layers `viirs` and `modis`: every 2026 hotspot of medium or high confidence, as counted by the
                               national summary (`repeat-national-fire`, <REPEAT_WORK>/national_profile/fire_landstatus/layers/
                               hotspots_2026.gpkg). Properties: m (month), h (1 = high confidence), p (1 = on KLH peat),
                               s (1 = likely static source: gas flare, volcano, offshore).
  fire_burned.pmtiles          layer `burned`: the KLHK burnt-area polygons 2015-2026 (_data/burnt_area_2015_2026_Indonesia.gpkg).
                               Properties: y (the burn years, e.g. "2019 2023"), n (number of years burned).
  fire_tiles.json              last hotspot date per sensor, years, feature counts, file sizes.

Points and polygons are kept at full precision; tippecanoe thins them per zoom level for display only (densest points and
smallest polygons dropped at low zoom), so counts must come from the tables, not from the map. Rerun after
`repeat-national-fire` or a new burnt-area delivery.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pandas as pd
import pyogrio

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[1]
DATA = Path(os.environ.get("REPEAT_DATA", WORK / "_data"))
FIRE = Path(os.environ.get("REPEAT_WORK", WORK / "re-peat" / "reports")) / "national_profile" / "fire_landstatus"
HOT = FIRE / "layers" / "hotspots_2026.gpkg"
BURN = DATA / "burnt_area_2015_2026_Indonesia.gpkg"
OUT = HERE.parent / "app" / "public" / "data"
IMAGE = "repeat-tippecanoe:2.79.0"
FILE_LIMIT_MB = 95
YEARS = list(range(2015, 2027))
# national scale: keep tiles small at low zoom (drop the densest points and the smallest polygons there), full detail at max zoom
FLAGS = {
    "hot": ["--force", "-Z", "3", "-z", "12", "--drop-densest-as-needed", "--extend-zooms-if-still-dropping", "-r1", "--buffer", "8"],
    "burn": ["--force", "-Z", "3", "-z", "13", "--drop-smallest-as-needed", "--coalesce-smallest-as-needed", "--extend-zooms-if-still-dropping",
             "--simplify-only-low-zooms", "--detect-shared-borders", "--buffer", "8"],
}


def fingerprint(paths, extra=""):
    h = hashlib.sha256(extra.encode())
    for p in paths:
        st = Path(p).stat()
        h.update(f"{p}:{st.st_size}:{st.st_mtime_ns}".encode())
    return h.hexdigest()


def tippecanoe(layers, out_path, flags):
    """layers: {name: GeoDataFrame}. Built inside the container (SQLite on a Windows bind mount is slow), then copied out."""
    with tempfile.TemporaryDirectory() as tmp:
        args = []
        for name, g in layers.items():
            src = Path(tmp) / f"{name}.geojsonl"
            pyogrio.write_dataframe(g, src, driver="GeoJSONSeq")
            args += ["-L", f"{name}:/in/{src.name}"]
        tip = " ".join(["tippecanoe", "-o", f"/tmp/{out_path.name}", *flags, *args])
        cmd = ["docker", "run", "--rm", "--entrypoint", "sh", "-v", f"{Path(tmp).resolve()}:/in:ro", "-v", f"{out_path.parent.resolve()}:/out", IMAGE,
               "-c", f"{tip} && cp /tmp/{out_path.name} /out/"]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode:
            raise SystemExit(f"tippecanoe failed for {out_path.name}:\n{r.stderr[-1200:]}")


def build(layers, dst, flags, maxzoom):
    """Tile; while the file is over the GitHub limit, rebuild one zoom lower (the source is untouched)."""
    while True:
        f = list(flags); f[f.index("-z") + 1] = str(maxzoom)
        tippecanoe(layers, dst, f)
        mb = dst.stat().st_size / 2**20
        if mb <= FILE_LIMIT_MB or maxzoom <= 8:
            return round(mb, 1), maxzoom
        print(f"  {dst.name}: {mb:.0f} MB at zoom {maxzoom}, rebuilding at {maxzoom - 1}", flush=True)
        maxzoom -= 1


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--hotspots-only", action="store_true", help="reuse the existing burned-area tiles and metadata")
    a = ap.parse_args(argv)
    for f in (HOT,) if a.hotspots_only else (HOT, BURN):
        if not f.exists():
            sys.exit(f"missing {f}")
    out = a.out / "national"
    out.mkdir(parents=True, exist_ok=True)
    meta_path = out / "fire_tiles.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    fmeta = json.loads((FIRE / "meta.json").read_text(encoding="utf-8"))

    # ------------------------------------------------------------ hotspots 2026
    dst = out / "fire_hotspots_2026.pmtiles"
    fp = fingerprint([HOT, FIRE / "meta.json"], json.dumps(FLAGS["hot"]) + "flags-v2")   # peat is yes/no, static True/False (text)
    if a.force or meta.get("hotspots", {}).get("fingerprint") != fp or not dst.exists():
        layers, counts = {}, {}
        for sensor in ("viirs", "modis"):
            g = pyogrio.read_dataframe(HOT, layer=f"{sensor}_2026", columns=["month", "conf", "peat", "static"])
            g = g.assign(m=g["month"].astype(int), h=(g["conf"].astype(str) == "high").astype(int),
                         p=(g["peat"].astype(str).str.lower() == "yes").astype(int), s=(g["static"].astype(str).str.lower() == "true").astype(int))[["m", "h", "p", "s", "geometry"]]
            layers[sensor], counts[sensor] = g, len(g)
        mb, z = build(layers, dst, FLAGS["hot"], 12)
        meta["hotspots"] = {"file": dst.name, "mb": mb, "maxzoom": z, "count": counts, "fingerprint": fp,
                            "last": {"viirs": fmeta.get("viirs_last"), "modis": fmeta.get("modis_last")},
                            "source": "VIIRS S-NPP (FIRMS standard and near real time) and MODIS (KLH file, then FIRMS near real time), medium and high confidence"}
        print(f"  hotspots 2026: {counts}, {mb} MB, zoom {z}", flush=True)
    else:
        print("  hotspots 2026: unchanged")

    if a.hotspots_only:
        meta_path.write_text(json.dumps(meta, indent=1))
        return

    # ------------------------------------------------------------ burned area 2015-2026
    dst = out / "fire_burned.pmtiles"
    fp = fingerprint([BURN], json.dumps(FLAGS["burn"]))
    if a.force or meta.get("burned", {}).get("fingerprint") != fp or not dst.exists():
        cols = [f"BA_{y}" for y in YEARS]
        g = pyogrio.read_dataframe(BURN, columns=cols, force_2d=True)
        flags = pd.DataFrame({y: g[f"BA_{y}"].notna() & (g[f"BA_{y}"].astype(str).str.strip() != "") for y in YEARS})
        g = g.assign(y=flags.apply(lambda r: " ".join(str(y) for y in YEARS if r[y]), axis=1), n=flags.sum(axis=1).astype(int))[["y", "n", "geometry"]]
        g = g[g["n"] > 0]
        per_year = {str(y): int(flags[y].sum()) for y in YEARS}
        mb, z = build({"burned": g}, dst, FLAGS["burn"], 13)
        meta["burned"] = {"file": dst.name, "mb": mb, "maxzoom": z, "polygons": len(g), "per_year": per_year, "fingerprint": fp,
                          "source": "KLHK burnt-area polygons 2015-2026", "incomplete": [2024, 2026]}
        print(f"  burned area: {len(g)} polygons, {mb} MB, zoom {z}", flush=True)
    else:
        print("  burned area: unchanged")
    meta_path.write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
