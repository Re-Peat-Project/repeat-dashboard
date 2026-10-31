"""Verify exported observations and source-polygon IDs without rebuilding outputs."""
import argparse
import json
import re

import geopandas as gpd
import pandas as pd
import pyogrio
from shapely.geometry import Point

from build_khg import OUT_DEFAULT, WORK


def check(code):
    root = OUT_DEFAULT / 'khg' / code
    original = pd.read_parquet(root / 'points/hotspots.parquet')
    result = pd.read_parquet(root / 'investigation/hotspots.parquet')
    pd.testing.assert_frame_equal(original, result[original.columns])
    meta = json.loads((root / 'investigation/sources.json').read_text())
    source = meta['sources']['licence']
    if source['available']:
        polygons = pyogrio.read_dataframe(WORK / source['source'], fid_as_index=True)
        sample = result.sample(min(24, len(result)), random_state=2026)
        pts = gpd.GeoSeries([Point(r.lon, r.lat) for r in sample.itertuples()], crs=4326).to_crs(polygons.crs)
        for row, point in zip(sample.itertuples(), pts):
            expected = set(str(i) for i, geom in polygons.geometry.items() if geom is not None and geom.intersects(point))
            actual = set(re.findall(r' · ID (\d+)(?: \||$)', row.licence or ''))
            assert actual == expected, (code, row.Index, actual, expected)
    print(f'{code}: observations unchanged; sampled licence IDs match source geometry', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--khg', action='append', default=[])
    parser.add_argument('--all', action='store_true')
    args = parser.parse_args()
    codes = sorted(p.parent.parent.name for p in (OUT_DEFAULT / 'khg').glob('*/investigation/sources.json')) if args.all else args.khg
    if not codes:
        parser.error('provide --khg CODE or --all')
    for code in codes:
        check(code)
