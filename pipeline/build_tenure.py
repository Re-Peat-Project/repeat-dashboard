"""Publish the tenure tables of `repeat-national-tenure` to the app: national/tenure_area.parquet, tenure_hotspots.parquet.

    python build_tenure.py

Reads <REPEAT_WORK>/national_profile/tenure/. Hotspots are kept for the shared calendar window only (ytd), so every year is
compared over the same months; tenure_window.json (copy of tenure_meta.json) records the window end. Rerun after `repeat-national-tenure`.
"""
import json
import os
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[1]
SRC = Path(os.environ.get("REPEAT_WORK", WORK / "re-peat" / "reports")) / "national_profile" / "tenure"
OUT = HERE.parent / "app" / "public" / "data" / "national"


def main():
    if not (SRC / "tenure_area.csv").exists():
        sys.exit(f"{SRC}: run repeat-national-tenure first")
    area = pd.read_csv(SRC / "tenure_area.csv")
    hot = pd.read_csv(SRC / "tenure_hotspots.csv")
    hot = hot[hot["ytd"]].drop(columns="ytd")
    hot = hot.groupby(["khg_id", "tenure", "sub", "dmpg", "year", "conf"], as_index=False)["n"].sum()
    OUT.mkdir(parents=True, exist_ok=True)
    area.to_parquet(OUT / "tenure_area.parquet", index=False, compression="zstd")
    hot.to_parquet(OUT / "tenure_hotspots.parquet", index=False, compression="zstd")
    (OUT / "tenure_window.json").write_text((SRC / "tenure_meta.json").read_text(encoding="utf-8"), encoding="utf-8")
    print(f"tenure: {len(area)} area rows, {len(hot)} hotspot rows, {area['khg_id'].nunique()} KHG")


if __name__ == "__main__":
    main()
