#!/usr/bin/env python3
"""Rubber-sheet an old map scan onto Web Mercator with a thin-plate spline.

    python3 tools/warp_map.py data/maps/<id>.gcps.json [--width 2400] [--smooth 0]

Input: a control-point file (see data/maps/*.gcps.json) listing pixel
positions on the scan and their real-world lat/lon, plus an optional
"mask" polygon in pixel coordinates (the map's neatline).

Output, next to the input:
    <id>.warped.webp   warped image with transparency, rows in Web Mercator
    <id>.warp.json     bounds (lat/lon), residuals, method
    <id>.points        QGIS Georeferencer control-point file (to refine in QGIS)
    gcps.js            all control-point files bundled for the in-app editor

The TPS passes exactly through every control point (smooth=0). A small
smoothing value (e.g. 0.001-0.01) trades exactness for less local bending
when some points are uncertain.
"""
import argparse
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw

R = 6378137.0


def merc(lat, lon):
    return R * np.radians(lon), R * np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))


def inv_merc(x, y):
    return np.degrees(2 * np.arctan(np.exp(y / R)) - np.pi / 2), np.degrees(x / R)


class TPS:
    """2-D thin-plate spline f: R2 -> R2 fitted on normalised coordinates."""

    def __init__(self, src, dst, smooth=0.0):
        self.mu, self.sd = src.mean(0), src.std(0).mean()
        s = (src - self.mu) / self.sd
        n = len(s)
        K = self._U(np.linalg.norm(s[:, None] - s[None], axis=-1)) + smooth * np.eye(n)
        P = np.hstack([np.ones((n, 1)), s])
        A = np.zeros((n + 3, n + 3))
        A[:n, :n], A[:n, n:], A[n:, :n] = K, P, P.T
        b = np.zeros((n + 3, 2))
        b[:n] = dst
        self.w = np.linalg.solve(A, b)
        self.s = s

    @staticmethod
    def _U(r):
        with np.errstate(divide="ignore", invalid="ignore"):
            u = r * r * np.log(r * r)
        return np.nan_to_num(u)

    def __call__(self, pts, chunk=200000):
        out = np.empty((len(pts), 2))
        for i in range(0, len(pts), chunk):
            q = (pts[i:i + chunk] - self.mu) / self.sd
            U = self._U(np.linalg.norm(q[:, None] - self.s[None], axis=-1))
            n = len(self.s)
            out[i:i + chunk] = U @ self.w[:n] + self.w[n] + q @ self.w[n + 1:]
        return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("gcps")
    ap.add_argument("--width", type=int, default=2400)
    ap.add_argument("--smooth", type=float, default=0.0)
    a = ap.parse_args()

    g = json.load(open(a.gcps))
    base = os.path.dirname(a.gcps)
    stem = os.path.basename(a.gcps).replace(".gcps.json", "")
    img = Image.open(os.path.join(base, g["image"])).convert("RGB")
    W, H = img.size
    pts = [p for p in g["points"] if p.get("enabled", True)]
    px = np.array([p["px"] for p in pts], float)
    mx, my = merc(np.array([p["lat"] for p in pts]), np.array([p["lon"] for p in pts]))
    mm = np.column_stack([mx, my])

    fwd = TPS(px, mm, a.smooth)    # pixel -> mercator
    inv = TPS(mm, px, a.smooth)    # mercator -> pixel (used for resampling)

    # residuals of the forward fit and leave-one-out prediction error (km on the ground)
    kscale = np.cos(np.radians(np.mean([p["lat"] for p in pts]))) / 1000
    res = np.hypot(*(fwd(px) - mm).T) * kscale
    loo = []
    for i in range(len(px)):
        m = np.ones(len(px), bool); m[i] = False
        t = TPS(px[m], mm[m], a.smooth)
        loo.append(float(np.hypot(*(t(px[i:i + 1])[0] - mm[i])) * kscale))

    # mask polygon (neatline) in pixels; default = whole image
    mask_poly = g.get("mask") or [[0, 0], [W, 0], [W, H], [0, H]]
    edge = []
    mp = np.array(mask_poly + [mask_poly[0]], float)
    for p0, p1 in zip(mp[:-1], mp[1:]):
        for t in np.linspace(0, 1, 60, endpoint=False):
            edge.append(p0 + (p1 - p0) * t)
    E = fwd(np.array(edge))
    x0, x1, y0, y1 = E[:, 0].min(), E[:, 0].max(), E[:, 1].min(), E[:, 1].max()

    ow = a.width
    oh = int(round(ow * (y1 - y0) / (x1 - x0)))
    gx, gy = np.meshgrid(x0 + (np.arange(ow) + 0.5) * (x1 - x0) / ow, y1 - (np.arange(oh) + 0.5) * (y1 - y0) / oh)
    src = inv(np.column_stack([gx.ravel(), gy.ravel()]))
    sx, sy = src[:, 0].reshape(oh, ow), src[:, 1].reshape(oh, ow)

    arr = np.asarray(img).astype(np.float32)
    # bilinear sampling
    xi, yi = np.clip(sx, 0, W - 1.001), np.clip(sy, 0, H - 1.001)
    x0i, y0i = np.floor(xi).astype(int), np.floor(yi).astype(int)
    fx, fy = (xi - x0i)[..., None], (yi - y0i)[..., None]
    c = (arr[y0i, x0i] * (1 - fx) * (1 - fy) + arr[y0i, x0i + 1] * fx * (1 - fy) +
         arr[y0i + 1, x0i] * (1 - fx) * fy + arr[y0i + 1, x0i + 1] * fx * fy)

    mimg = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mimg).polygon([tuple(p) for p in mask_poly], fill=255)
    marr = np.asarray(mimg)
    inside = (sx >= 0) & (sx < W) & (sy >= 0) & (sy < H)
    alpha = np.where(inside, marr[np.clip(sy, 0, H - 1).astype(int), np.clip(sx, 0, W - 1).astype(int)], 0)

    out = np.dstack([c.astype(np.uint8), alpha.astype(np.uint8)])
    out_path = os.path.join(base, stem + ".warped.webp")
    Image.fromarray(out, "RGBA").save(out_path, "WEBP", quality=82, method=6)

    s_lat, w_lon = inv_merc(x0, y0)
    n_lat, e_lon = inv_merc(x1, y1)
    meta = {
        "method": "thin-plate spline" + (f" (smooth {a.smooth})" if a.smooth else " (exact)"),
        "bounds": [[round(float(s_lat), 6), round(float(w_lon), 6)], [round(float(n_lat), 6), round(float(e_lon), 6)]],
        "size": [ow, oh], "points": len(pts),
        "residual_km_max": round(float(res.max()), 2),
        "loo_km_rms": round(float(np.sqrt(np.mean(np.square(loo)))), 1),
        "loo_km": {p["name"]: round(v, 1) for p, v in zip(pts, loo)},
    }
    json.dump(meta, open(os.path.join(base, stem + ".warp.json"), "w"), indent=1, ensure_ascii=False)

    # QGIS Georeferencer points file (map coords in EPSG:4326, source Y negative)
    with open(os.path.join(base, stem + ".points"), "w") as f:
        f.write("#CRS: EPSG:4326\nmapX,mapY,sourceX,sourceY,enable,dX,dY,residual\n")
        for p in pts:
            f.write(f"{p['lon']},{p['lat']},{p['px'][0]},{-p['px'][1]},1,0,0,0\n")

    write_bundle(base)
    print(f"wrote {out_path} {ow}x{oh}, {os.path.getsize(out_path)//1000} kB; "
          f"leave-one-out RMS {meta['loo_km_rms']} km")


def write_bundle(base):
    """data/maps/gcps.js: every *.gcps.json as window.AR_GCPS[id], so the
    browser's control-point editor can load them from file:// too."""
    out = {}
    for f in sorted(os.listdir(base)):
        if f.endswith(".gcps.json"):
            out[f[:-len(".gcps.json")]] = json.load(open(os.path.join(base, f)))
    with open(os.path.join(base, "gcps.js"), "w") as fo:
        fo.write("/* Generated by tools/warp_map.py from data/maps/*.gcps.json. Do not edit; edit the .gcps.json files. */\n")
        fo.write("window.AR_GCPS = " + json.dumps(out, ensure_ascii=False, indent=1) + ";\n")


if __name__ == "__main__":
    main()
