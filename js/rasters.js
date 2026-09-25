/*
 * Terrain rasters produced by tools/terrain.py are shipped as base64 PNGs
 * inside JS files (so the app works from file://). They are decoded through
 * Blob -> createImageBitmap -> canvas, which keeps the canvas untainted.
 *
 * Bands (see tools/terrain.py):
 *   terrain: R landform class, G HAND (m), B slope (0.5 deg)
 *   extra:   R stream distance (100 m), G elevation (10 m), B TPI 5 km (2 m, +128)
 *   pot:     R barrow, G settlement, B hillfort (0..255)
 */
(function () {
  "use strict";

  async function decodePng(b64) {
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([u8], { type: "image/png" }), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    const cv = document.createElement("canvas");
    cv.width = bmp.width; cv.height = bmp.height;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  }

  class Raster {
    constructor(meta) {
      Object.assign(this, meta);
      this.dx = (this.e - this.w) / this.cols;
      this.dy = (this.n - this.s) / this.rows;
    }
    async load() {
      const [t, x, p] = await Promise.all([decodePng(this.png.terrain), decodePng(this.png.extra), decodePng(this.png.pot)]);
      this.T = t; this.X = x; this.P = p;
      delete this.png; // free the base64 strings
      return this;
    }
    covers(lat, lon) { return lat < this.n && lat > this.s && lon > this.w && lon < this.e; }
    index(lat, lon) {
      const r = Math.floor((this.n - lat) / this.dy), c = Math.floor((lon - this.w) / this.dx);
      if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return -1;
      return (r * this.cols + c) * 4;
    }
    sample(lat, lon) {
      const i = this.index(lat, lon);
      if (i < 0) return null;
      const T = this.T, X = this.X, P = this.P;
      return {
        raster: this.name, res_m: this.res_m,
        landform: T[i], hand: T[i + 1], slope: T[i + 2] / 2,
        dist: X[i] * 100, elev: X[i + 1] * 10, tpi5: (X[i + 2] - 128) * 2,
        barrow: P[i] / 255, settlement: P[i + 1] / 255, hillfort: P[i + 2] / 255,
      };
    }
  }

  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const invMercY = (y) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

  /*
   * Render one band of a raster as an image overlay, re-projected to
   * Web-Mercator rows. colorFn(value, i) -> [r,g,b,a] or null.
   */
  function renderOverlay(r, colorFn, maxW) {
    const outW = Math.min(r.cols, maxW || 3000);
    const y0 = mercY(r.n), y1 = mercY(r.s);
    const outH = Math.round((outW * (y0 - y1)) / (((r.e - r.w) * Math.PI) / 180));
    const cv = document.createElement("canvas");
    cv.width = outW; cv.height = outH;
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(outW, outH);
    const d = img.data;
    for (let y = 0; y < outH; y++) {
      const lat = invMercY(y0 - ((y + 0.5) / outH) * (y0 - y1));
      const row = Math.min(r.rows - 1, Math.floor((r.n - lat) / r.dy));
      for (let x = 0; x < outW; x++) {
        const col = Math.min(r.cols - 1, Math.floor(((x + 0.5) / outW) * r.cols));
        const c = colorFn(r, (row * r.cols + col) * 4);
        if (!c) continue;
        const o = (y * outW + x) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3];
      }
    }
    ctx.putImageData(img, 0, 0);
    return { url: cv.toDataURL(), bounds: [[r.s, r.w], [r.n, r.e]] };
  }

  /*
   * Local maxima of a potential band inside a bbox, for survey planning.
   * band: 0 barrow, 1 settlement, 2 hillfort.
   */
  function peaks(r, band, bbox, minVal, spacingKm, distKm) {
    const out = [];
    const r0 = Math.max(0, Math.floor((r.n - bbox.n) / r.dy)), r1 = Math.min(r.rows - 1, Math.ceil((r.n - bbox.s) / r.dy));
    const c0 = Math.max(0, Math.floor((bbox.w - r.w) / r.dx)), c1 = Math.min(r.cols - 1, Math.ceil((bbox.e - r.w) / r.dx));
    const P = r.P, min = minVal * 255;
    for (let y = r0 + 1; y < r1; y++) {
      for (let x = c0 + 1; x < c1; x++) {
        const i = (y * r.cols + x) * 4 + band, v = P[i];
        if (v < min) continue;
        let isMax = true;
        for (let dy = -1; dy <= 1 && isMax; dy++) for (let dx = -1; dx <= 1; dx++) {
          if ((dy || dx) && P[((y + dy) * r.cols + x + dx) * 4 + band] > v) { isMax = false; break; }
        }
        if (isMax) out.push({ lat: r.n - (y + 0.5) * r.dy, lon: r.w + (x + 0.5) * r.dx, v: v / 255 });
      }
    }
    out.sort((a, b) => b.v - a.v);
    const kept = [];
    for (const p of out) {
      if (kept.some((k) => distKm(p.lat, p.lon, k.lat, k.lon) < spacingKm)) continue;
      kept.push(p);
      if (kept.length >= 500) break;
    }
    return kept;
  }

  window.ARRasters = { Raster, renderOverlay, peaks, mercY, invMercY };
})();
