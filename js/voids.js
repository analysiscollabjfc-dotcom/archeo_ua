/*
 * "Promising terrain": land as far as possible from settlements.
 *
 * For the current map view a grid (rows spaced in Web Mercator so it can be
 * drawn as an image overlay) gets the exact Euclidean distance (km) to the
 * nearest settlement point (Felzenszwalb-Huttenlocher distance transform),
 * which peaks in the gaps midway between settlements. The void score is
 *     void = 1 - exp(-(d - dMin) / D)      (0 closer than dMin)
 * optionally multiplied by terrain potential, and raised near detected
 * circle/rectangle features (amplification).
 */
(function () {
  "use strict";
  const INF = 1e20;
  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const invMercY = (y) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

  // 1-D squared distance transform of f sampled at spacing s (Felzenszwalb & Huttenlocher 2012)
  function dt1(f, n, s) {
    const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q++) {
      let sq;
      while (true) {
        const p = v[k];
        sq = ((f[q] + (q * s) ** 2) - (f[p] + (p * s) ** 2)) / (2 * s * (q - p));
        if (sq <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break;
      }
      if (k === 0 && sq <= z[0]) { v[0] = q; z[0] = -INF; z[1] = INF; continue; }
      k++; v[k] = q; z[k] = sq; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q * s) k++;
      d[q] = ((q - v[k]) * s) ** 2 + f[v[k]];
    }
    return d;
  }

  /*
   * bounds {s,w,n,e}; points [[lat,lon],...]; cols. Returns distances (km).
   */
  function distanceGrid(bounds, points, cols) {
    const y0 = mercY(bounds.n), y1 = mercY(bounds.s);
    const rows = Math.max(2, Math.round((cols * (y0 - y1)) / (((bounds.e - bounds.w) * Math.PI) / 180)));
    const latC = (bounds.n + bounds.s) / 2;
    const dx = ((bounds.e - bounds.w) / cols) * 111.32 * Math.cos((latC * Math.PI) / 180);
    const dy = ((bounds.n - bounds.s) / rows) * 110.57; // mean row height (km)
    const g = new Float64Array(cols * rows).fill(INF);
    // settlements outside the view still matter: clamp them onto a margin, keeping true distance
    // approximately by seeding the nearest border cell with their squared distance to it
    for (const [lat, lon] of points) {
      const cx = ((lon - bounds.w) / (bounds.e - bounds.w)) * cols, cy = ((y0 - mercY(lat)) / (y0 - y1)) * rows;
      const ix = Math.min(cols - 1, Math.max(0, Math.floor(cx))), iy = Math.min(rows - 1, Math.max(0, Math.floor(cy)));
      const ox = (cx < 0 ? -cx : cx >= cols ? cx - cols + 1 : 0) * dx, oy = (cy < 0 ? -cy : cy >= rows ? cy - rows + 1 : 0) * dy;
      const v = ox * ox + oy * oy, i = iy * cols + ix;
      if (v < g[i]) g[i] = v;
    }
    const tmp = new Float64Array(Math.max(cols, rows));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) tmp[x] = g[y * cols + x];
      const r = dt1(tmp, cols, dx);
      for (let x = 0; x < cols; x++) g[y * cols + x] = r[x];
    }
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) tmp[y] = g[y * cols + x];
      const r = dt1(tmp, rows, dy);
      for (let y = 0; y < rows; y++) g[y * cols + x] = r[y];
    }
    const dist = new Float32Array(cols * rows);
    for (let i = 0; i < dist.length; i++) dist[i] = Math.sqrt(g[i]);
    const latOfRow = (r) => invMercY(y0 - ((r + 0.5) / rows) * (y0 - y1));
    const lonOfCol = (c) => bounds.w + ((c + 0.5) / cols) * (bounds.e - bounds.w);
    return { cols, rows, dist, bounds, dx, dy, latOfRow, lonOfCol };
  }

  // Local maxima of a score grid, strongest first, at least minKm apart
  function peaks(score, cols, rows, lat, lon, minKm, limit, minVal) {
    const c = [];
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
      const v = score[y * cols + x];
      if (v < minVal) continue;
      let m = true;
      for (let j = -1; j <= 1 && m; j++) for (let i = -1; i <= 1; i++) if ((i || j) && score[(y + j) * cols + x + i] > v) { m = false; break; }
      if (m) c.push({ lat: lat(y), lon: lon(x), v, x, y });
    }
    c.sort((a, b) => b.v - a.v);
    const out = [];
    const km = (a, b) => Math.hypot((a.lat - b.lat) * 110.57, (a.lon - b.lon) * 111.32 * Math.cos((a.lat * Math.PI) / 180));
    for (const p of c) {
      if (out.some((q) => km(p, q) < minKm)) continue;
      out.push(p);
      if (out.length >= limit) break;
    }
    return out;
  }

  window.ARVoids = { distanceGrid, peaks, dt1 };
})();
