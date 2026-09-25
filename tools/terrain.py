#!/usr/bin/env python3
"""Terrain derivatives and site-potential surfaces for archeo_ua.

    python3 tools/terrain.py DEM_DIR [area ...]

For every mosaic made by tools/dem_fetch.py (default: ukraine_ov8 and all
*_30m areas) it computes, from the Copernicus GLO-30 DEM:

  landform class   floodplain / terrace / footslope / slope / plateau / ridge
  HAND             height above nearest drainage (m)
  slope            degrees
  TPI              topographic position (m) at ~1 km and ~5 km
  stream distance  metres to the nearest stream
  potentials       barrow, settlement, hillfort (0..1, rule-based fuzzy model)
  streams          vector stream network (source -> mouth)

and writes data/raster_<area>.js (PNG-encoded, base64) and
data/streams_<area>.js for the browser.

The potentials are an expert rule model, not a trained classifier. Weights
are at the top of this file; once a site register is available they should be
calibrated against it.

Requires numpy, scipy, rasterio, pysheds, shapely, Pillow and node.
"""
import base64
import io
import json
import math
import os
import subprocess
import sys
import time

import numpy as np
import rasterio
from PIL import Image
from scipy import ndimage as ndi
from shapely.geometry import LineString, Point, Polygon

if not hasattr(np, "in1d"):  # pysheds still calls the NumPy 1 name
    np.in1d = np.isin
from pysheds.grid import Grid  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "data")
NODATA = -9999.0

# Landform classes (keep in sync with js/app.js LANDFORMS)
WATER, FLOODPLAIN, TERRACE, FOOTSLOPE, SLOPE, PLATEAU, RIDGE = range(7)


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def zones():
    code = ("global.window=global;require(" + json.dumps(os.path.join(DATA, "zones.js")) +
            ");process.stdout.write(JSON.stringify(AR_ZONES))")
    return json.loads(subprocess.check_output(["node", "-e", code]))


# ---------------------------------------------------------------------------

def params_for(res_m):
    """Thresholds depend on cell size: coarse DEMs smooth slopes and relief."""
    coarse = res_m > 100
    return {
        "stream_km2": 5.0 if coarse else 1.0,         # channel initiation
        "vec_km2": 25.0 if coarse else 2.0,           # streams exported as vectors
        "flat": 1.0 if coarse else 2.0,               # deg
        "steep": 3.0 if coarse else 7.0,              # deg
        "tpi_s_m": 1000, "tpi_l_m": 5000,             # neighbourhood radii
        "ridge_tpi": 2.0 if coarse else 3.0,          # m
        "hf_tpi": (2.0, 8.0) if coarse else (4.0, 15.0),
        "hf_relief": (15.0, 45.0) if coarse else (20.0, 60.0),
        "barrow_tpi": (3.0, 18.0) if coarse else (5.0, 25.0),
    }


def ramp(x, a, b):
    return np.clip((x - a) / (b - a), 0, 1)


def process(path, name):
    with rasterio.open(path) as ds:
        dem = ds.read(1).astype(np.float32)
        tr = ds.transform
        bounds = ds.bounds
    H, W = dem.shape
    lat = tr.f + (np.arange(H) + 0.5) * tr.e
    dy = abs(tr.e) * 110570.0
    dx_row = tr.a * 111320.0 * np.cos(np.radians(lat))
    dx = float(np.mean(dx_row))
    res_m = math.sqrt(dx * dy)
    P = params_for(res_m)
    log(f"{name}: {W}x{H}, ~{res_m:.0f} m cells")

    nod = (dem < -50) | (dem == NODATA)
    sea = nod | (dem <= 0.3)
    dem_f = np.where(nod, 0, dem)

    # ---- hydrology ----
    grid = Grid.from_raster(path)
    r = grid.read_raster(path)
    a = np.asarray(r)
    a[nod] = NODATA
    fl = grid.fill_depressions(grid.fill_pits(r))
    inf = grid.resolve_flats(fl)
    fdir = grid.flowdir(inf)
    w = grid.view(r).copy()
    w[:] = ((dy * dx_row) / 1e6)[:, None]
    acc = grid.accumulation(fdir, weights=w)
    chan = np.asarray(acc) >= P["stream_km2"]
    chan_r = grid.view(fdir).copy()
    chan_r[:] = chan
    hand = np.asarray(grid.compute_hand(fdir, fl, chan_r.astype(bool)), dtype=np.float32)
    hand = np.where(np.isfinite(hand), hand, 0)
    hand = np.clip(hand, 0, 400)
    log("  hydrology done")

    # ---- morphometry ----
    gy, gx = np.gradient(dem_f)
    gx = gx / dx_row[:, None]
    gy = gy / dy
    slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
    aspect = np.degrees(np.arctan2(-gx, gy)) % 360  # 0 = north, clockwise
    south = np.cos(np.radians(aspect - 180))       # 1 = south-facing
    ks = max(3, int(round(P["tpi_s_m"] * 2 / res_m)) | 1)
    kl = max(5, int(round(P["tpi_l_m"] * 2 / res_m)) | 1)
    tpi_s = (dem_f - ndi.uniform_filter(dem_f, ks)).astype(np.float32)
    tpi_l = (dem_f - ndi.uniform_filter(dem_f, kl)).astype(np.float32)
    relief = (ndi.maximum_filter(dem_f, ks) - ndi.minimum_filter(dem_f, ks)).astype(np.float32)
    maxslope = ndi.maximum_filter(slope, max(3, ks // 2 | 1))
    dist = ndi.distance_transform_edt(~chan, sampling=(dy, dx)).astype(np.float32)
    log("  morphometry done")

    # ---- landform classes ----
    lf = np.full((H, W), SLOPE, dtype=np.uint8)
    flat, steep = P["flat"], P["steep"]
    lf[(hand >= 15) & (slope < flat * 1.5)] = PLATEAU
    lf[(hand >= 2.5) & (hand < 15) & (slope < flat * 1.5)] = TERRACE
    lf[(slope >= flat) & (slope < steep) & (tpi_s < -0.5) & (hand < 30)] = FOOTSLOPE
    lf[(tpi_s > P["ridge_tpi"]) & (slope < steep) & (hand >= 10)] = RIDGE
    lf[(hand < 2.5) & (slope < steep)] = FLOODPLAIN
    lf[sea] = WATER

    # ---- zone priors ----
    zs = zones()
    zb = np.full((H, W), 0.5, np.float32)
    zset = np.full((H, W), 0.7, np.float32)
    zh = np.full((H, W), 0.7, np.float32)
    lon_c = tr.c + (np.arange(W) + 0.5) * tr.a
    step = max(1, W // 400)
    # evaluate zones on a coarse lattice, then expand (zones are schematic anyway)
    ci = np.arange(0, W, step)
    ri = np.arange(0, H, step)
    polys = [(z, Polygon([(p[1], p[0]) for p in z["poly"]])) for z in zs]
    zb_c = np.full((len(ri), len(ci)), 0.5, np.float32)
    zs_c = np.full_like(zb_c, 0.7)
    zh_c = np.full_like(zb_c, 0.7)
    for i, rr in enumerate(ri):
        for j, cc in enumerate(ci):
            pt = Point(lon_c[cc], lat[rr])
            for z, pg in polys:
                if pg.contains(pt):
                    zb_c[i, j], zs_c[i, j], zh_c[i, j] = z["weights"]["barrow"], z["weights"]["settlement"], z["weights"]["hillfort"]
                    break
    rep = lambda c: np.repeat(np.repeat(c, step, 0), step, 1)[:H, :W]
    zb, zset, zh = rep(zb_c), rep(zs_c), rep(zh_c)

    # ---- potentials (0..1) ----
    not_wet = 1 - 0.8 * (lf == FLOODPLAIN)
    # Barrows: watershed ridges and high plateau edges with wide views.
    barrow = (zb * ramp(tpi_l, *P["barrow_tpi"]) * (1 - ramp(slope, flat, steep * 1.3)) *
              ramp(hand, 10, 35) * (0.5 + 0.5 * ramp(tpi_s, 0, P["ridge_tpi"] * 1.5)))
    # Settlements: dry ground close to water, low terraces and gentle lower slopes.
    near = np.exp(-np.maximum(dist - 100, 0) / 400.0)
    hand_bell = ramp(hand, 2, 5) * (1 - 0.8 * ramp(hand, 15, 35))
    settlement = (zset * near * hand_bell * (1 - ramp(slope, steep, steep * 2)) *
                  (0.85 + 0.15 * south) * not_wet)
    hillfort = (zh * ramp(tpi_s, *P["hf_tpi"]) * ramp(relief, *P["hf_relief"]) *
                ramp(maxslope, flat * 2, steep * 2) * np.exp(-np.maximum(dist - 300, 0) / 1500.0) *
                ramp(hand, 10, 25))
    for arr in (barrow, settlement, hillfort):
        arr[sea] = 0
        np.power(arr, 1.5, out=arr)  # sharpen: reserve high values for cells that meet every criterion
    log("  potentials done",
        "; ".join("%s p50/p90/p99 %.2f/%.2f/%.2f" % ((n,) + tuple(np.percentile(x[~sea], [50, 90, 99])))
                  for n, x in (("barrow", barrow), ("settlement", settlement), ("hillfort", hillfort))))

    # ---- export rasters ----
    # National grid is written at ~600 m, study areas at ~60 m. Values are
    # coarsely quantised: PNG size is driven by noise in the low bits.
    f = 3 if res_m > 100 else 2
    def ds_(x, how="mean"):
        h, w_ = (x.shape[0] // f) * f, (x.shape[1] // f) * f
        b = x[:h, :w_].reshape(h // f, f, w_ // f, f)
        if how == "max":
            return b.max(axis=(1, 3))
        if how == "mode":  # landform: most common class in the block
            flat_b = b.transpose(0, 2, 1, 3).reshape(h // f, w_ // f, f * f)
            cnt = np.stack([(flat_b == k).sum(-1) for k in range(7)], -1)
            return cnt.argmax(-1).astype(np.uint8)
        return b.mean(axis=(1, 3))
    u8 = lambda x: np.clip(np.round(x), 0, 255).astype(np.uint8)
    A = lambda shape: np.full(shape, 255, np.uint8)
    lf_d = ds_(lf, "mode")
    shp = lf_d.shape
    terrain = np.dstack([
        lf_d,
        u8(ds_(hand)),                 # HAND in 1 m
        u8(ds_(slope) * 2),            # slope in 0.5 deg
        A(shp),
    ])
    extra = np.dstack([
        u8(ds_(dist) / 100),           # stream distance in 100 m (max 25.5 km)
        u8(ds_(np.where(sea, 0, dem_f)) / 10),  # elevation in 10 m
        u8(ds_(np.clip(tpi_l, -63, 63)) / 2 + 128),  # TPI(5 km) in 2 m
        A(shp),
    ])
    q = lambda x: u8(np.round(ds_(x, "max") * 31) * 8.2)  # 32 levels
    pot = np.dstack([q(barrow), q(settlement), q(hillfort), A(shp)])

    def png64(arr):
        # alpha = 255 everywhere so browsers do not premultiply the colour channels
        buf = io.BytesIO()
        Image.fromarray(arr, "RGBA").save(buf, "PNG", optimize=True)
        return base64.b64encode(buf.getvalue()).decode()

    rows, cols = shp
    meta = {
        "name": name, "w": bounds.left, "e": bounds.left + cols * tr.a * f, "n": bounds.top, "s": bounds.top - rows * abs(tr.e) * f,
        "cols": cols, "rows": rows, "res_m": round(res_m * f), "source": "Copernicus GLO-30 DEM",
        "bands": {
            "terrain": ["landform", "hand_m", "slope_halfdeg"],
            "extra": ["dist_100m", "elev_10m", "tpi5_2m_plus128"],
            "pot": ["barrow", "settlement", "hillfort"],
        },
    }
    out = os.path.join(DATA, f"raster_{name}.js")
    with open(out, "w") as fo:
        fo.write("/* Generated by tools/terrain.py from the Copernicus GLO-30 DEM (© DLR/Airbus, EU Copernicus). */\n")
        fo.write("window.AR_RASTERS = window.AR_RASTERS || {};\n")
        fo.write(f"window.AR_RASTERS[{json.dumps(name)}] = " + json.dumps(dict(meta, png={
            "terrain": png64(terrain), "extra": png64(extra), "pot": png64(pot),
        })) + ";\n")
    log("  wrote", out, os.path.getsize(out) // 1000, "kB")

    # ---- stream vectors ----
    mask = grid.view(fdir).copy()
    mask[:] = np.asarray(acc) >= P["vec_km2"]
    fc = grid.extract_river_network(fdir, mask.astype(bool))
    accA = np.asarray(acc)
    streams = []
    for ft in fc["features"]:
        cs = np.array(ft["geometry"]["coordinates"])
        if len(cs) < 3:
            continue
        c = np.clip(np.round((cs[:, 0] - tr.c) / tr.a).astype(int), 0, W - 1)
        rr = np.clip(np.round((cs[:, 1] - tr.f) / tr.e).astype(int), 0, H - 1)
        ar = accA[rr, c]
        if ar[0] > ar[-1]:
            c, rr, ar = c[::-1], rr[::-1], ar[::-1]
        if sea[rr, c].all():
            continue
        x = tr.c + (c + 0.5) * tr.a
        y = tr.f + (rr + 0.5) * tr.e
        ls = LineString(np.column_stack([x, y])).simplify(tr.a * 1.5)
        k = np.array(ls.coords)
        streams.append({"a": round(float(ar[-1]), 1),
                        "y": np.round(k[:, 1] * 1e4).astype(int).tolist(), "x": np.round(k[:, 0] * 1e4).astype(int).tolist()})
    out = os.path.join(DATA, f"streams_{name}.js")
    with open(out, "w") as fo:
        fo.write("/* Generated by tools/terrain.py: D8 streams from Copernicus GLO-30. y,x = degrees*1e4; a = catchment km2 at mouth. */\n")
        fo.write("window.AR_STREAMS = window.AR_STREAMS || {};\n")
        fo.write(f"window.AR_STREAMS[{json.dumps(name)}] = " + json.dumps(streams, separators=(",", ":")) + ";\n")
    log("  wrote", out, len(streams), "streams", os.path.getsize(out) // 1000, "kB")


if __name__ == "__main__":
    dem_dir = sys.argv[1] if len(sys.argv) > 1 else "dem"
    names = sys.argv[2:] or ["ukraine_ov8"] + sorted(f[:-4] for f in os.listdir(dem_dir) if f.endswith("_30m.tif"))
    for n in names:
        process(os.path.join(dem_dir, n + ".tif"), "ukraine" if n == "ukraine_ov8" else n)
