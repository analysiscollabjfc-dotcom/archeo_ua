/*
 * Circle / rectangle detection in satellite imagery (crop marks, soil marks,
 * barrows, ring ditches, enclosures, foundations).
 *
 * Pipeline for one scan window (3x3 web-map tiles around a point):
 *   1. fetch tiles (CORS) into a canvas, downsample x2 (~1.6 m/px at z17)
 *   2. two channels: brightness (soil marks) and excess-green (crop marks),
 *      each blurred and turned into Sobel gradients; the stronger wins
 *   3. circles: gradient-directed Hough voting over a range of radii, scored by
 *      how much of the circumference is supported and by inside/outside contrast
 *   4. rectangles: Hough lines -> pairs of parallel lines -> perpendicular pairs
 *      -> four sides checked for edge support; features that continue far past
 *      the corners (field boundaries, roads) are penalised
 *
 * This is a heuristic triage tool: expect false positives (trees, field
 * corners, farm buildings, irrigation circles). The user confirms or rejects.
 */
(function () {
  "use strict";

  const TILE = 256;
  const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
  const lat2y = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z; };
  const x2lon = (x, z) => (x / 2 ** z) * 360 - 180;
  const y2lat = (y, z) => { const n = Math.PI - (2 * Math.PI * y) / 2 ** z; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

  /* ------------------------------------------------------------------ */
  /* Imagery                                                             */
  /* ------------------------------------------------------------------ */
  async function loadWindow(url, lat, lon, z, half) {
    const cx = Math.floor(lon2x(lon, z)), cy = Math.floor(lat2y(lat, z));
    const n = 2 * half + 1;
    const cv = document.createElement("canvas");
    cv.width = cv.height = n * TILE;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    const jobs = [];
    for (let j = -half; j <= half; j++) for (let i = -half; i <= half; i++) {
      const u = url.replace("{z}", z).replace("{x}", cx + i).replace("{y}", cy + j);
      jobs.push(fetch(u, { mode: "cors" }).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); })
        .then((b) => createImageBitmap(b)).then((bmp) => ctx.drawImage(bmp, (i + half) * TILE, (j + half) * TILE)));
    }
    await Promise.all(jobs);
    const x0 = cx - half, y0 = cy - half;
    return {
      canvas: cv, z, x0, y0, n,
      // pixel (full res) -> lat/lon
      toLatLng: (px, py) => [y2lat(y0 + py / TILE, z), x2lon(x0 + px / TILE, z)],
      mpp: (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Image processing helpers                                            */
  /* ------------------------------------------------------------------ */
  function blur(a, W, H, s) {
    const r = Math.ceil(s * 2.5), k = [];
    let sum = 0;
    for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * s * s)); k.push(v); sum += v; }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    const t = new Float32Array(W * H), o = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += a[y * W + Math.min(W - 1, Math.max(0, x + i))] * k[i + r];
      t[y * W + x] = v;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0;
      for (let i = -r; i <= r; i++) v += t[Math.min(H - 1, Math.max(0, y + i)) * W + x] * k[i + r];
      o[y * W + x] = v;
    }
    return o;
  }
  function sobel(a, W, H) {
    const gx = new Float32Array(W * H), gy = new Float32Array(W * H), m = new Float32Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const tl = a[i - W - 1], t = a[i - W], tr = a[i - W + 1], l = a[i - 1], r = a[i + 1], bl = a[i + W - 1], b = a[i + W], br = a[i + W + 1];
      const X = tr + 2 * r + br - tl - 2 * l - bl, Y = bl + 2 * b + br - tl - 2 * t - tr;
      gx[i] = X; gy[i] = Y; m[i] = Math.hypot(X, Y);
    }
    return { gx, gy, m };
  }
  function percentile(a, p) {
    const s = Array.from(a.filter((_, i) => i % 7 === 0)).sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0;
  }
  function normalise(a) {
    let mu = 0; for (const v of a) mu += v; mu /= a.length;
    let sd = 0; for (const v of a) sd += (v - mu) ** 2; sd = Math.sqrt(sd / a.length) || 1;
    const o = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) o[i] = (a[i] - mu) / sd;
    return o;
  }

  /* ------------------------------------------------------------------ */
  /* Detection                                                           */
  /* ------------------------------------------------------------------ */
  function detect(win, opts) {
    const o = Object.assign({ rMin: 8, rMax: 40, sMin: 15, sMax: 150, minScore: 0.5 }, opts || {});
    const src = win.canvas, f = 2;                    // work at half resolution
    const W = src.width / f, H = src.height / f, mpp = win.mpp * f;
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    const lum = new Float32Array(W * H), exg = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = d[4 * i], g = d[4 * i + 1], b = d[4 * i + 2];
      lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
      exg[i] = 2 * g - r - b;
    }
    const L = blur(normalise(lum), W, H, 1.2), G = blur(normalise(exg), W, H, 1.2);
    // Modern objects (roofs, pools, concrete, tanks) have saturated or near-white colour;
    // crop and soil marks are shades of soil and vegetation.
    const modernAt = (pts) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (const [x, y] of pts) { const i = 4 * (Math.round(y) * W + Math.round(x)); r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      if (!n) return false;
      r /= n; g /= n; b /= n;
      const spread = Math.max(r, g, b) - Math.min(r, g, b), lumi = 0.299 * r + 0.587 * g + 0.114 * b;
      return spread > 75 || lumi > 205 || (b > r + 15 && b > g + 5);
    };
    const s1 = sobel(L, W, H), s2 = sobel(G, W, H);
    // per pixel take the channel with the stronger gradient
    const gx = new Float32Array(W * H), gy = new Float32Array(W * H), mag = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (s1.m[i] >= s2.m[i]) { gx[i] = s1.gx[i]; gy[i] = s1.gy[i]; mag[i] = s1.m[i]; }
      else { gx[i] = s2.gx[i]; gy[i] = s2.gy[i]; mag[i] = s2.m[i]; }
    }
    const thr = Math.max(percentile(mag, 0.9), 0.35);
    const edges = [];
    const isEdge = new Uint8Array(W * H);
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (mag[i] > thr) { edges.push(i); isEdge[i] = 1; }
    }
    // dilate edge mask by 1 px for support checks
    const near = new Uint8Array(W * H);
    for (const i of edges) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near[i + dy * W + dx] = 1;

    // Oriented edge test: is there an edge within +-1.5 px of (x, y) along (nx, ny)
    // whose gradient is parallel to (nx, ny)? Random texture rarely passes this.
    const oriented = (x, y, nx, ny) => {
      for (const t of [0, -1, 1, -1.5, 1.5]) {
        const px = Math.round(x + nx * t), py = Math.round(y + ny * t);
        if (px < 1 || py < 1 || px >= W - 1 || py >= H - 1) continue;
        const i = py * W + px, m = mag[i];
        if (m > thr && Math.abs((gx[i] * nx + gy[i] * ny) / m) > 0.8) return true;
      }
      return false;
    };
    const circles = detectCircles(o, W, H, mpp, edges, gx, gy, mag, oriented, L, G, modernAt);
    const rects = detectRects(o, W, H, mpp, edges, gx, gy, oriented, modernAt);
    // back to full-resolution pixel coordinates and lat/lon
    const out = [];
    for (const c of circles) {
      const [lat, lon] = win.toLatLng(c.x * f, c.y * f);
      out.push({ type: "circle", lat, lon, r_m: c.r * mpp, score: c.score, modern: !!c.modern, px: [c.x * f, c.y * f], rpx: c.r * f });
    }
    for (const r of rects) {
      const corners = r.corners.map(([x, y]) => win.toLatLng(x * f, y * f));
      const cx = r.corners.reduce((s, p) => s + p[0], 0) / 4, cy = r.corners.reduce((s, p) => s + p[1], 0) / 4;
      const [lat, lon] = win.toLatLng(cx * f, cy * f);
      out.push({ type: "rect", lat, lon, corners, a_m: r.a * mpp, b_m: r.b * mpp, score: r.score, modern: !!r.modern, px: [cx * f, cy * f], pxCorners: r.corners.map(([x, y]) => [x * f, y * f]) });
    }
    return out.filter((s) => s.score >= o.minScore).sort((a, b) => b.score - a.score);
  }

  function detectCircles(o, W, H, mpp, edges, gx, gy, mag, oriented, L, G, modernAt) {
    const rMin = Math.max(3, Math.round(o.rMin / mpp)), rMax = Math.round(o.rMax / mpp);
    const radii = [];
    for (let r = rMin; r <= rMax; r += r < 12 ? 1 : 2) radii.push(r);
    const acc = radii.map(() => new Uint16Array(W * H));
    for (const i of edges) {
      const x = i % W, y = (i / W) | 0, m = mag[i], ux = gx[i] / m, uy = gy[i] / m;
      for (let k = 0; k < radii.length; k++) {
        const r = radii[k];
        for (const sgn of [1, -1]) {
          const cx = Math.round(x + sgn * ux * r), cy = Math.round(y + sgn * uy * r);
          if (cx >= 0 && cy >= 0 && cx < W && cy < H) acc[k][cy * W + cx]++;
        }
      }
    }
    const cand = [];
    for (let k = 0; k < radii.length; k++) {
      const r = radii[k], A = acc[k], need = 2 * Math.PI * r * 0.35;
      for (let y = r; y < H - r; y++) for (let x = r; x < W - r; x++) {
        const v = A[y * W + x];
        if (v < need) continue;
        let isMax = true;
        for (let dy = -2; dy <= 2 && isMax; dy++) for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && A[(y + dy) * W + x + dx] > v) { isMax = false; break; }
        if (!isMax) continue;
        // circumference support: perimeter samples with a radially oriented edge
        let sup = 0;
        for (let t = 0; t < 48; t++) {
          const a = (t / 48) * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
          if (oriented(x + r * ca, y + r * sa, ca, sa)) sup++;
        }
        sup /= 48;
        if (sup < 0.5) continue;
        // refine the radius: along each direction find the strongest radially
        // oriented edge between 0.4r and 1.5r; the median distance is the radius
        const ds = [];
        for (let t = 0; t < 48; t++) {
          const a = (t / 48) * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
          let best = 0, bd = 0;
          for (let dd = r * 0.4; dd <= r * 1.5; dd += 0.5) {
            const px = Math.round(x + ca * dd), py = Math.round(y + sa * dd);
            if (px < 1 || py < 1 || px >= W - 1 || py >= H - 1) break;
            const i = py * W + px, m = mag[i];
            if (m > best && Math.abs((gx[i] * ca + gy[i] * sa) / m) > 0.8) { best = m; bd = dd; }
          }
          if (best) ds.push(bd);
        }
        if (ds.length < 24) continue;
        ds.sort((p, q) => p - q);
        const rr = ds[ds.length >> 1];
        if (rr * mpp < o.rMin * 0.9 || rr * mpp > o.rMax * 1.1) continue; // e.g. a tree clump
        // roundness: spread of edge distances relative to the radius
        const iqr = (ds[Math.floor(ds.length * 0.75)] - ds[Math.floor(ds.length * 0.25)]) / rr;
        const round = Math.max(0, 1 - iqr / 0.35);
        // inside vs annulus contrast on both channels
        const ctr = Math.max(contrast(L, W, H, x, y, rr), contrast(G, W, H, x, y, rr));
        const inside = [];
        for (let t = 0; t < 12; t++) { const a = (t / 12) * 2 * Math.PI; inside.push([x + 0.5 * rr * Math.cos(a), y + 0.5 * rr * Math.sin(a)]); }
        inside.push([x, y]);
        const modern = modernAt(inside);
        cand.push({ x, y, r: rr, modern, score: Math.min(1, sup * (0.5 + 0.25 * round + 0.25 * Math.min(1, ctr / 0.8))) * (modern ? 0.5 : 1) });
      }
    }
    // strongest first; on ties prefer the larger radius (outer edge of a ring or disc)
    cand.sort((a, b) => b.score - a.score || b.r - a.r);
    const kept = [];
    for (const c of cand) {
      if (kept.some((k) => Math.hypot(k.x - c.x, k.y - c.y) < Math.max(k.r, c.r) * 0.7)) continue;
      kept.push(c);
      if (kept.length >= 25) break;
    }
    return kept;
  }
  function contrast(A, W, H, cx, cy, r) {
    let si = 0, ni = 0, so = 0, no = 0;
    const R = Math.round(r * 1.5);
    for (let y = cy - R; y <= cy + R; y += 2) for (let x = cx - R; x <= cx + R; x += 2) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < r * 0.8) { si += A[y * W + x]; ni++; } else if (d > r * 1.15 && d <= R) { so += A[y * W + x]; no++; }
    }
    return ni && no ? Math.abs(si / ni - so / no) : 0;
  }

  function detectRects(o, W, H, mpp, edges, gx, gy, oriented, modernAt) {
    const sMin = o.sMin / mpp, sMax = o.sMax / mpp;
    const NT = 180, diag = Math.ceil(Math.hypot(W, H)), NR = 2 * diag + 1;
    const acc = new Uint16Array(NT * NR);
    const cosT = new Float32Array(NT), sinT = new Float32Array(NT);
    for (let t = 0; t < NT; t++) { cosT[t] = Math.cos((t * Math.PI) / NT); sinT[t] = Math.sin((t * Math.PI) / NT); }
    for (const i of edges) {
      const x = i % W, y = (i / W) | 0;
      let th = Math.atan2(gy[i], gx[i]); if (th < 0) th += Math.PI; // normal direction
      const t0 = Math.round((th / Math.PI) * NT);
      for (let dt = -4; dt <= 4; dt++) {
        const t = (t0 + dt + NT) % NT, rho = Math.round(x * cosT[t] + y * sinT[t]) + diag;
        acc[t * NR + rho]++;
      }
    }
    // line peaks
    const lines = [];
    const minVotes = sMin * 0.8;
    for (let t = 0; t < NT; t++) for (let r = 1; r < NR - 1; r++) {
      const v = acc[t * NR + r];
      if (v < minVotes) continue;
      let isMax = true;
      for (let dt = -3; dt <= 3 && isMax; dt++) for (let dr = -3; dr <= 3; dr++) {
        const tt = (t + dt + NT) % NT, rr = r + dr;
        if ((dt || dr) && rr >= 0 && rr < NR && acc[tt * NR + rr] > v) { isMax = false; break; }
      }
      if (isMax) lines.push({ t, rho: r - diag, v });
    }
    lines.sort((a, b) => b.v - a.v);
    // both edges of one drawn line (a ditch, a wall) give two close parallel peaks: keep one
    const L = [];
    for (const l of lines) {
      if (L.some((k) => Math.abs(k.t - l.t) <= 3 && Math.abs(k.rho - l.rho) <= 4)) continue;
      L.push(l); if (L.length >= 60) break;
    }
    const tdiff = (a, b) => { const d = Math.abs(a - b) % NT; return Math.min(d, NT - d); };
    const pairs = [];
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      if (tdiff(L[i].t, L[j].t) > 3) continue;
      const sep = Math.abs(L[i].rho - L[j].rho);
      if (sep >= sMin && sep <= sMax) pairs.push({ a: L[i], b: L[j], t: (L[i].t + L[j].t) / 2, sep });
    }
    const inter = (l1, l2) => {
      const a1 = cosT[l1.t], b1 = sinT[l1.t], a2 = cosT[l2.t], b2 = sinT[l2.t], det = a1 * b2 - a2 * b1;
      if (Math.abs(det) < 1e-6) return null;
      return [(l1.rho * b2 - l2.rho * b1) / det, (a1 * l2.rho - a2 * l1.rho) / det];
    };
    const support = (p, q) => {
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, n = Math.max(8, Math.round(len / 2));
      const nx = -(q[1] - p[1]) / len, ny = (q[0] - p[0]) / len; // side normal
      let s = 0, c = 0;
      for (let k = 0; k <= n; k++) {
        const x = p[0] + ((q[0] - p[0]) * k) / n, y = p[1] + ((q[1] - p[1]) * k) / n;
        if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
        c++; if (oriented(x, y, nx, ny)) s++;
      }
      return c ? s / c : 0;
    };
    const rects = [];
    for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++) {
      const P = pairs[i], Q = pairs[j];
      if (Math.abs(tdiff(P.t, Q.t) - NT / 2) > 5) continue;
      const aspect = Math.max(P.sep, Q.sep) / Math.min(P.sep, Q.sep);
      if (aspect > 4) continue;
      const c = [inter(P.a, Q.a), inter(P.a, Q.b), inter(P.b, Q.b), inter(P.b, Q.a)];
      if (c.some((p) => !p || p[0] < 2 || p[1] < 2 || p[0] > W - 3 || p[1] > H - 3)) continue;
      const sides = [support(c[0], c[1]), support(c[1], c[2]), support(c[2], c[3]), support(c[3], c[0])];
      const minS = Math.min(...sides), mean = sides.reduce((a, b) => a + b, 0) / 4;
      if (minS < 0.45 || mean < 0.6) continue;
      // lines that carry on well beyond the corners are field boundaries or roads
      let ext = 0;
      for (let k = 0; k < 4; k++) {
        const p = c[k], q = c[(k + 1) % 4], dx = q[0] - p[0], dy = q[1] - p[1];
        ext += support([q[0] + dx * 0.15, q[1] + dy * 0.15], [q[0] + dx * 0.6, q[1] + dy * 0.6]);
        ext += support([p[0] - dx * 0.15, p[1] - dy * 0.15], [p[0] - dx * 0.6, p[1] - dy * 0.6]);
      }
      ext /= 8;
      let score = mean * (1 - 0.8 * Math.max(0, ext - 0.2));
      const ccx = (c[0][0] + c[2][0]) / 2, ccy = (c[0][1] + c[2][1]) / 2, inside = [[ccx, ccy]];
      for (const p of c) for (const k of [0.3, 0.6]) inside.push([ccx + (p[0] - ccx) * k, ccy + (p[1] - ccy) * k]);
      const modern = modernAt(inside); // roofs, concrete pads
      if (modern) score *= 0.5;
      rects.push({ corners: c, a: P.sep, b: Q.sep, score, modern });
    }
    rects.sort((a, b) => b.score - a.score);
    const kept = [];
    for (const r of rects) {
      const cx = r.corners.reduce((s, p) => s + p[0], 0) / 4, cy = r.corners.reduce((s, p) => s + p[1], 0) / 4;
      // one rectangle per place: drop overlapping alternatives (inner/outer edges, neighbours)
      if (kept.some((k) => Math.hypot(k.cx - cx, k.cy - cy) < Math.max(Math.min(r.a, r.b), Math.min(k.a, k.b)))) continue;
      kept.push(Object.assign(r, { cx, cy }));
      if (kept.length >= 15) break;
    }
    return kept;
  }

  /* Thumbnail of a detection with the shape drawn on it (data URL). */
  function thumbnail(win, det, size) {
    size = size || 180;
    const span = Math.max(80, (det.type === "circle" ? det.rpx * 3.2 : Math.max(...det.pxCorners.flatMap((p) => [Math.abs(p[0] - det.px[0]), Math.abs(p[1] - det.px[1])])) * 3));
    const cv = document.createElement("canvas"); cv.width = cv.height = size;
    const ctx = cv.getContext("2d"), k = size / span, ox = det.px[0] - span / 2, oy = det.px[1] - span / 2;
    ctx.drawImage(win.canvas, ox, oy, span, span, 0, 0, size, size);
    ctx.strokeStyle = "#ffd54f"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.beginPath();
    if (det.type === "circle") ctx.arc(size / 2, size / 2, det.rpx * k, 0, 2 * Math.PI);
    else det.pxCorners.forEach(([x, y], i) => (i ? ctx.lineTo((x - ox) * k, (y - oy) * k) : ctx.moveTo((x - ox) * k, (y - oy) * k)));
    ctx.closePath(); ctx.stroke();
    try { return cv.toDataURL("image/jpeg", 0.8); } catch (e) { return null; }
  }

  window.ARShapes = { loadWindow, detect, thumbnail };
})();
