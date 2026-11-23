"""Build weekly hotspot counts for the Water Table Profile from the dated inputs.

Each sensor uses its own coverage. MODIS uses only the dated FIRMS segment of the
KLH/FIRMS splice. Join by coordinates to the national fire tally for province,
KHG, on-land and static-source flags. Publish only weeks with all seven dates.
"""

import argparse
import json
from pathlib import Path

import pandas as pd
import pyogrio

from build_national import CONF, DATA, OUT_DEFAULT, REPORTS


def dated_points(data, sensor):
    files = ("hotspot_viirs_snpp_sp_2026.gpkg", "hotspot_viirs_snpp_nrt_2026.gpkg") if sensor == "viirs" else (
        "hotspots_modis_2026.gpkg",)
    parts = []
    for file in files:
        cols = ["acq_date", "confidence", "type"] if sensor == "viirs" else ["acq_date", "level", "source"]
        g = pyogrio.read_dataframe(data / file, columns=cols, use_arrow=True)
        if sensor == "modis":
            g = g[g["source"].str.contains("FIRMS", case=False, na=False)]
        dates = pd.to_datetime(g["acq_date"], errors="coerce").dt.normalize()
        conf = g["confidence"].map(CONF) if sensor == "viirs" else g["level"]
        keep = conf.isin(["medium", "high"]) & dates.notna()
        if "type" in g:
            keep &= g["type"].eq(0)
        parts.append((dates.dropna(), pd.DataFrame({"day": dates[keep], "x": g.geometry[keep].x, "y": g.geometry[keep].y})))
    return pd.concat([days for days, _ in parts]), pd.concat([points for _, points in parts], ignore_index=True)


def weekly_counts(data, fire_dir, sensor, through):
    dates, points = dated_points(data, sensor)
    dates = pd.DatetimeIndex(dates[dates <= pd.Timestamp(through)].unique()).sort_values()
    by_week = dates.to_period("W-SUN").value_counts()
    weeks = sorted(by_week[by_week == 7].index.start_time.strftime("%Y-%m-%d"))

    layer = f"{sensor}_2026"
    flags = pyogrio.read_dataframe(fire_dir / "layers" / "hotspots_2026.gpkg", layer=layer,
                                  columns=["province", "khg_id", "on_land", "static"], use_arrow=True)
    flags = flags.assign(x=flags.geometry.x, y=flags.geometry.y).drop(columns="geometry").drop_duplicates()
    matched = points[points["day"].le(pd.Timestamp(through))].merge(flags, on=["x", "y"], validate="many_to_one")
    matched = matched[matched["on_land"] & matched["static"].eq("False")].copy()
    matched["week"] = matched["day"].dt.to_period("W-SUN").dt.start_time.dt.strftime("%Y-%m-%d")

    rows = matched[matched["week"].isin(weeks)]
    counts = {"national": rows.groupby("week").size().to_dict()}
    for field in ("province", "khg_id"):
        counts[field] = {region: series.groupby("week").size().to_dict()
                         for region, series in rows[rows[field].ne("")].groupby(field)}
    print(f"{sensor}: {len(weeks)} complete weeks, {len(rows):,} land detections after static-source screening", flush=True)
    return {"weeks": weeks, "counts": counts}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=DATA)
    parser.add_argument("--fire-dir", type=Path, default=REPORTS / "fire_landstatus")
    parser.add_argument("--out", type=Path, default=OUT_DEFAULT)
    args = parser.parse_args()
    meta = json.loads((args.fire_dir / "meta.json").read_text(encoding="utf-8"))
    weekly = {sensor: weekly_counts(args.data, args.fire_dir, sensor, meta[f"{sensor}_last"])
              for sensor in ("viirs", "modis")}
    dest = args.out / "national" / "hotspots_weekly.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".tmp")
    tmp.write_text(json.dumps(weekly, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(dest)
    print(dest)


if __name__ == "__main__":
    main()
