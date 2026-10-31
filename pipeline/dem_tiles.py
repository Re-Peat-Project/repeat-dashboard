"""DEM GeoTIFF -> PMTiles raster pyramid for the dashboard.

Two kinds, both display derivatives (the native raster stays where it is):
  relief  hillshade multiplied into a hypsometric tint, WebP
  elev    elevation packed into RGB (value = (R*65536 + G*256 + B)/100 - 10000 metres
          i.e. 1 cm steps), lossless PNG, read back in the browser for the cursor readout

The highest zoom comes from the native cell size, so nothing is drawn finer than the data.
Lower zooms average the native cells.

    python dem_tiles.py --tif deltadtm.tif --out relief.pmtiles --kind relief --vmin 1 --vmax 9
"""
import argparse
import io
import math
import sys
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import Writer
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.warp import reproject, transform_bounds

TILE = 256
WEBM = CRS.from_epsg(3857)
ORIGIN = 20037508.342789244
# viridis-like ramp, light to dark is not used for terrain: low = blue-green, high = brown
RAMP = np.array([(36, 86, 120), (62, 150, 140), (150, 190, 120), (226, 214, 140), (196, 150, 96), (140, 96, 70)], float)


def tile_bounds(z, x, y):
    n = 2 ** z
    size = 2 * ORIGIN / n
    return ORIGIN * -1 + x * size, ORIGIN - (y + 1) * size, ORIGIN * -1 + (x + 1) * size, ORIGIN - y * size


def lonlat_to_tile(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    lat_r = math.radians(lat)
    y = int((1 - math.asinh(math.tan(lat_r)) / math.pi) / 2 * n)
    return min(max(x, 0), n - 1), min(max(y, 0), n - 1)


def native_zoom(src):
    """Highest zoom whose Web Mercator cell is no finer than the native cell, at the raster's latitude."""
    w, s, e, n = transform_bounds(src.crs, "EPSG:4326", *src.bounds)
    lat = math.radians((s + n) / 2)
    if src.crs.is_geographic:
        res_m = abs(src.res[1]) * 111320.0
    else:
        res_m = abs(src.res[0])
    return max(0, math.ceil(math.log2(2 * ORIGIN / TILE * math.cos(lat) / res_m)))


# one-hue sequential ramp (light to dark) for model fields such as water-table depth; palette is validated in the app design pass
FIELD_RAMP = np.array([(235, 244, 250), (173, 208, 232), (104, 164, 208), (52, 117, 175), (24, 72, 128), (8, 35, 82)], float)


def tint(z, vmin, vmax, ramp=RAMP):
    t = np.clip((np.nan_to_num(z, nan=vmin) - vmin) / (vmax - vmin), 0, 1)
    pos = t * (len(ramp) - 1)
    i = np.minimum(pos.astype(int), len(ramp) - 2)
    f = (pos - i)[..., None]
    return ramp[i] * (1 - f) + ramp[i + 1] * f


def hillshade(z, cell, exag, azimuth=315.0, altitude=45.0):
    dzdy, dzdx = np.gradient(z, cell)
    slope = np.arctan(exag * np.hypot(dzdx, dzdy))
    aspect = np.arctan2(dzdy, -dzdx)
    az, alt = math.radians(360 - azimuth + 90), math.radians(altitude)
    hs = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(hs, 0, 1)


def read_tile(src, z, x, y, pad):
    left, bottom, right, top = tile_bounds(z, x, y)
    cell = (right - left) / TILE
    size = TILE + 2 * pad
    dst = np.full((size, size), np.nan, np.float32)
    reproject(rasterio.band(src, 1), dst, src_nodata=src.nodata, dst_nodata=np.nan, dst_crs=WEBM,
              dst_transform=from_origin(left - pad * cell, top + pad * cell, cell, cell),
              resampling=Resampling.average)
    return np.ma.masked_invalid(dst), cell


def encode(kind, arr, cell, vmin, vmax, exag):
    valid = ~np.ma.getmaskarray(arr)
    if not valid.any():
        return None
    z = np.ma.filled(arr, np.nan).astype(float)
    if kind == "elev":
        v = np.clip(np.round((np.nan_to_num(z[1:-1, 1:-1], nan=-10000 + 0.0) + 10000) * 100), 0, 2**24 - 1).astype(np.uint32)
        rgba = np.zeros((TILE, TILE, 4), np.uint8)
        rgba[..., 0], rgba[..., 1], rgba[..., 2] = v >> 16, (v >> 8) & 255, v & 255
        rgba[..., 3] = np.where(valid[1:-1, 1:-1], 255, 0)
        buf = io.BytesIO()
        Image.fromarray(rgba, "RGBA").save(buf, "PNG", optimize=True)
        return buf.getvalue()
    if kind == "field":
        rgb = tint(z[1:-1, 1:-1], vmin, vmax, FIELD_RAMP)
        rgba = np.zeros((TILE, TILE, 4), np.uint8)
        rgba[..., :3] = np.clip(rgb, 0, 255)
        rgba[..., 3] = np.where(valid[1:-1, 1:-1], 255, 0)
        buf = io.BytesIO()
        Image.fromarray(rgba, "RGBA").save(buf, "WEBP", quality=90, method=4)
        return buf.getvalue()
    zf = np.where(np.isnan(z), np.nanmean(z), z)
    hs = hillshade(zf, cell, exag)[1:-1, 1:-1]
    rgb = tint(z[1:-1, 1:-1], vmin, vmax) * (0.55 + 0.6 * hs[..., None])
    rgba = np.zeros((TILE, TILE, 4), np.uint8)
    rgba[..., :3] = np.clip(rgb, 0, 255)
    rgba[..., 3] = np.where(valid[1:-1, 1:-1], 255, 0)
    buf = io.BytesIO()
    Image.fromarray(rgba, "RGBA").save(buf, "WEBP", quality=82, method=4)
    return buf.getvalue()


def build(tif, out, kind, vmin, vmax, exag, zmin, zmax):
    with rasterio.open(tif) as src:
        zmax = native_zoom(src) if zmax is None else zmax
        w, s, e, n = transform_bounds(src.crs, "EPSG:4326", *src.bounds)
        print(f"{Path(tif).name}: {src.crs} res={src.res} native z={zmax} bounds={w:.3f},{s:.3f},{e:.3f},{n:.3f}", flush=True)
        ttype = TileType.PNG if kind == "elev" else TileType.WEBP
        out = Path(out)
        out.parent.mkdir(parents=True, exist_ok=True)
        count = 0
        with open(out, "wb") as fh:
            wr = Writer(fh)
            tiles = []
            for z in range(zmin, zmax + 1):
                x0, y1 = lonlat_to_tile(w, s, z)
                x1, y0 = lonlat_to_tile(e, n, z)
                for x in range(x0, x1 + 1):
                    for y in range(y0, y1 + 1):
                        tiles.append((zxy_to_tileid(z, x, y), z, x, y))
            tiles.sort()
            for tid, z, x, y in tiles:
                arr, cell = read_tile(src, z, x, y, 1)
                data = encode(kind, arr, cell, vmin, vmax, exag)
                if data is None:
                    continue
                wr.write_tile(tid, data)
                count += 1
            wr.finalize(
                {"tile_type": ttype, "tile_compression": Compression.NONE, "min_zoom": zmin, "max_zoom": zmax,
                 "min_lon_e7": int(w * 1e7), "min_lat_e7": int(s * 1e7), "max_lon_e7": int(e * 1e7), "max_lat_e7": int(n * 1e7),
                 "center_zoom": (zmin + zmax) // 2, "center_lon_e7": int((w + e) / 2 * 1e7), "center_lat_e7": int((s + n) / 2 * 1e7)},
                {"name": Path(tif).stem, "kind": kind, "vmin": vmin, "vmax": vmax, "native_zoom": zmax,
                 "encoding": "rgb_cm_offset_-10000" if kind == "elev" else "relief"},
            )
    mb = out.stat().st_size / 1e6
    print(f"  {count} tiles, {mb:.1f} MB -> {out}")
    return mb


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--tif", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--kind", choices=["relief", "elev", "field"], default="relief")
    ap.add_argument("--vmin", type=float, required=True)
    ap.add_argument("--vmax", type=float, required=True)
    ap.add_argument("--exag", type=float, default=30.0, help="vertical exaggeration for the hillshade; peat relief is a few metres")
    ap.add_argument("--zmin", type=int, default=6)
    ap.add_argument("--zmax", type=int, default=None, help="default: from native cell size")
    a = ap.parse_args()
    sys.exit(0 if build(a.tif, a.out, a.kind, a.vmin, a.vmax, a.exag, a.zmin, a.zmax) else 1)
