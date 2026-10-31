"""Exact hotspot/land intersections for the investigation workspace.

Run with --khg CODE (repeatable) or --all. Existing source tables are untouched.
All matches are retained; administrative overlaps do not establish responsibility.
"""
import argparse
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd
import pyogrio
from shapely.geometry import box

from build_khg import KHG_ROOT, OUT_DEFAULT, WORK, fingerprint, khg_folder


def build(code, holder_names=False):
    kdir = khg_folder(code)
    out = OUT_DEFAULT / 'khg' / code / 'investigation'
    points = OUT_DEFAULT / 'khg' / code / 'points/hotspots.parquet'
    if not points.exists():
        print(f'{code}: no hotspot table; skipped', flush=True)
        return
    national = kdir / '00_inputs/national'
    sources = {
        'licence': (national / 'izin_usaha_2025.gpkg', ['IZIN_USAHA', 'KEG_USAHA']),
        'village': (national / 'desa_target_pemulihan_ekosistem_gambut.gpkg', ['DESA_2023', 'KEC_2023']),
        'dmpg': (national / 'dpg/dpg_villages_boundaries.gpkg', ['desa', 'kecamatan']),
        'forest': (WORK / '_data/landstatus/KWSHUTAN_AR_250K_2023_Transcripted.gpkg', None),
        'burn_years': (national / 'burnt_area_2015_2026_Indonesia.gpkg', None),
    }
    existing = [points] + [p for p, _ in sources.values() if p.exists()]
    fp = fingerprint(existing, extra=f'investigation-v2:{holder_names}')
    meta = out / 'sources.json'
    if meta.exists() and (out / 'hotspots.parquet').exists() and json.loads(meta.read_text()).get('fingerprint') == fp:
        print(f'{code}: cached', flush=True)
        return
    df = pd.read_parquet(points)
    pts = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df.lon, df.lat), crs=4326)
    provenance = {}
    for name, (path, fields) in sources.items():
        if not path.exists():
            df[name] = None
            provenance[name] = {'available': False, 'source': str(path)}
            continue
        info = pyogrio.read_info(path)
        bbox = gpd.GeoSeries([box(*pts.total_bounds)], crs=4326).to_crs(info['crs']).total_bounds
        layer = pyogrio.read_dataframe(path, bbox=tuple(bbox), fid_as_index=True).to_crs(4326)
        if name == 'burn_years':
            layer['_value'] = layer.apply(lambda r: ', '.join(c[3:] for c in layer.columns if c.startswith('BA_') and pd.notna(r[c]) and float(r[c]) > 0), axis=1)
        else:
            chosen = fields or ['Fungsi_KWS', 'Fungsi', 'NAMOBJ']
            if name == 'forest':
                chosen = ['Fungsi_KWS'] if 'Fungsi_KWS' in layer else chosen
            if name == 'licence' and holder_names:
                chosen = ['PERUSAHAAN', *chosen]
            layer['_value'] = layer.apply(lambda r: ' · '.join(str(r[c]) for c in chosen if c in r and pd.notna(r[c])), axis=1)
            if name == 'licence':
                layer['_value'] += ' · ID ' + layer.index.astype(str)
        joined = gpd.sjoin(pts[['geometry']], layer[['_value', 'geometry']], how='left', predicate='intersects')
        values = joined.groupby(level=0)['_value'].agg(lambda a: ' | '.join(sorted(set(str(v) for v in a if pd.notna(v) and str(v)))))
        df[name] = values.reindex(df.index).fillna('')
        provenance[name] = {'available': True, 'source': str(path.relative_to(WORK)), 'predicate': 'intersects', 'features': len(layer)}
    out.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out / 'hotspots.parquet', index=False, compression='zstd')
    meta.write_text(json.dumps({'fingerprint': fp, 'sources': provenance, 'holder_names': holder_names, 'note': 'Licence IDs are source GeoPackage FIDs. All intersecting polygons retained. Village coverage is limited to target and DMPG villages.'}, indent=2))
    print(f'{code}: {len(df)} hotspots with land context', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--khg', action='append', default=[])
    parser.add_argument('--all', action='store_true')
    parser.add_argument('--holder-names', action='store_true', help='Include licence holders, matching build_khg.py export policy')
    args = parser.parse_args()
    codes = sorted(p.name.split('_', 1)[0] for p in KHG_ROOT.iterdir() if p.is_dir() and p.name[0].isdigit()) if args.all else args.khg
    if not codes:
        parser.error('provide --khg CODE or --all')
    for code in codes:
        build(code, args.holder_names)
