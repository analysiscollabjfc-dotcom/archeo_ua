#!/usr/bin/env python3
"""Build Copernicus GLO-30 DEM mosaics for archeo_ua.

Reads the public Copernicus DEM COG tiles on AWS (no account needed) over
HTTP, using their internal overviews so only the needed resolution is
transferred.

    python3 tools/dem_fetch.py OUT_DIR

Writes:
    OUT_DIR/ukraine_ov8.tif    whole Ukraine, 1/8 overview (~1/450 deg, ~120-240 m)
    OUT_DIR/<area>_30m.tif     study areas at full 1 arcsec (~20-30 m)

Copernicus DEM © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH
2014-2018, provided under COPERNICUS by the European Union and ESA.
"""
import math
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin

os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")

URL = ("/vsicurl/https://copernicus-dem-30m.s3.amazonaws.com/"
       "Copernicus_DSM_COG_10_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM/"
       "Copernicus_DSM_COG_10_{ns}{lat:02d}_00_{ew}{lon:03d}_00_DEM.tif")

NODATA = -9999.0

REGIONS = {
    # name: (west, south, east, north, overview factor, pixels per degree)
    "ukraine_ov8": (22.0, 44.3, 40.3, 52.4, 8, 450),
    # 30 m study areas (add your own here)
    "talne_30m": (30.15, 48.5, 30.9, 49.0, 1, 3600),
}


def tile_url(lat, lon):
    return URL.format(ns="N" if lat >= 0 else "S", lat=abs(lat), ew="E" if lon >= 0 else "W", lon=abs(lon))


def read_tile(lat, lon, factor):
    """Return (array, west, north, xres, yres) or None if the tile does not exist (sea)."""
    try:
        with rasterio.open(tile_url(lat, lon)) as ds:
            h, w = math.ceil(ds.height / factor), math.ceil(ds.width / factor)
            a = ds.read(1, out_shape=(h, w), resampling=Resampling.average)
            return a, ds.bounds.left, ds.bounds.top, (ds.bounds.right - ds.bounds.left) / w, (ds.bounds.top - ds.bounds.bottom) / h
    except rasterio.errors.RasterioIOError:
        return None


def build(name, west, south, east, north, factor, ppd, out_dir):
    out = os.path.join(out_dir, name + ".tif")
    if os.path.exists(out):
        print("exists", out)
        return out
    res = 1.0 / ppd
    W, H = round((east - west) * ppd), round((north - south) * ppd)
    mosaic = np.full((H, W), NODATA, dtype=np.float32)
    tiles = [(la, lo) for la in range(math.floor(south), math.ceil(north)) for lo in range(math.floor(west), math.ceil(east))]
    print(f"{name}: {len(tiles)} tiles -> {W}x{H}")

    def job(t):
        return t, read_tile(t[0], t[1], factor)

    done = 0
    with ThreadPoolExecutor(8) as ex:
        for (la, lo), r in ex.map(job, tiles):
            done += 1
            if r is None:
                continue
            a, tw, tn, xr, yr = r
            # Tiles north of 50N are narrower in pixels; resample onto the common grid by nearest index.
            rows = np.arange(H)
            cols = np.arange(W)
            lat_c = north - (rows + 0.5) * res
            lon_c = west + (cols + 0.5) * res
            ri = np.floor((tn - lat_c) / yr).astype(int)
            ci = np.floor((lon_c - tw) / xr).astype(int)
            rm = (ri >= 0) & (ri < a.shape[0])
            cm = (ci >= 0) & (ci < a.shape[1])
            if not rm.any() or not cm.any():
                continue
            sub = a[np.ix_(ri[rm], ci[cm])]
            r0, c0 = np.where(rm)[0], np.where(cm)[0]
            mosaic[r0[0]:r0[-1] + 1, c0[0]:c0[-1] + 1] = sub
            if done % 20 == 0:
                print(f"  {done}/{len(tiles)}", flush=True)
    profile = dict(driver="GTiff", width=W, height=H, count=1, dtype="float32", crs="EPSG:4326",
                   transform=from_origin(west, north, res, res), nodata=NODATA,
                   compress="deflate", predictor=3, tiled=True, blockxsize=512, blockysize=512)
    with rasterio.open(out, "w", **profile) as dst:
        dst.write(mosaic, 1)
    print("wrote", out, os.path.getsize(out) // 1_000_000, "MB")
    return out


if __name__ == "__main__":
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "dem"
    os.makedirs(out_dir, exist_ok=True)
    only = sys.argv[2:] or list(REGIONS)
    for n in only:
        build(n, *REGIONS[n], out_dir)
