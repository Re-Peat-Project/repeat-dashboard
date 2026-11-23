"""Publish the national summary of burned area and hotspots by land status (`repeat-national-fire`, `repeat-national-fire-tables`
in repeat-prioritisation) to the app: national/fire_area.parquet, national/fire_hot.parquet, national/fire_meta.json.

    python build_fire_summary.py

Reads <REPEAT_WORK>/national_profile/fire_landstatus/. Area rows: island, province, in_khg, forest_group, kawasan, concession (first
licence type), lic_bits (every licence type), dmpg, peat (1 = peat, 0 = not, 3 = peat tile not fetched) with area and burned area
per year in hectares. Hotspot rows: the same classes with source (modis 2026, viirs 2012-2026), year, month (MODIS only), conf,
static flag and ytd (VIIRS: on or before the last day of the 2026 record). Rerun after `repeat-national-fire-tables`.
"""
import argparse
import json
import os
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[1]
SRC = Path(os.environ.get("REPEAT_WORK", WORK / "re-peat" / "reports")) / "national_profile" / "fire_landstatus"
OUT = HERE.parent / "app" / "public" / "data"
DIMS = ["island", "province", "in_khg", "forest_group", "kawasan", "concession", "lic_bits", "dmpg", "peat"]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=OUT)
    out = ap.parse_args(argv).out / "national"
    if not (SRC / "area.parquet").exists():
        sys.exit(f"{SRC}: run repeat-national-fire and repeat-national-fire-tables first")
    area = pd.read_parquet(SRC / "area.parquet")
    num = [c for c in area.columns if c.endswith("_ha")]
    area[num] = area[num].round(2)
    hot = pd.read_parquet(SRC / "hot.parquet")
    hot = hot[hot["conf"].isin(["medium", "high"])].copy()            # low confidence is never shown
    hot = hot.groupby(DIMS + ["source", "year", "month", "conf", "static", "ytd"], as_index=False)["n"].sum()
    meta = json.loads((SRC / "meta.json").read_text(encoding="utf-8"))
    out.mkdir(parents=True, exist_ok=True)
    area.to_parquet(out / "fire_area.parquet", index=False, compression="zstd")
    hot.to_parquet(out / "fire_hot.parquet", index=False, compression="zstd")
    keep = {k: meta[k] for k in ("cell_m", "years", "viirs_last", "modis_last", "static_radius_m")}
    (out / "fire_meta.json").write_text(json.dumps(keep), encoding="utf-8")
    print(f"fire summary: {len(area)} area rows, {len(hot)} hotspot rows, "
          f"{(out / 'fire_area.parquet').stat().st_size / 1e6:.1f} + {(out / 'fire_hot.parquet').stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
