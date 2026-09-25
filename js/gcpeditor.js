/*
 * Control-point editor for historical maps.
 *
 *   TPS        thin-plate spline (same maths as tools/warp_map.py)
 *   WarpLayer  Leaflet layer that draws a scan warped by a TPS. The image is
 *              cut into a triangle mesh and each triangle is drawn with its
 *              own affine transform, so no pixel read-back is needed (works
 *              from file://, where canvas pixel access is blocked).
 *   Editor     scan viewer + draggable map markers + point table, live preview,
 *              per-point leave-one-out error, save / export / import.
 */
(function () {
  "use strict";

  const R = 6378137;
  const W0 = 256; // Leaflet world size at zoom 0 (px)
  // Web-Mercator world pixels at zoom 0 <-> lat/lon (same as map.project(_, 0))
  const toWorld = (lat, lon) => {
    const s = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
    return [W0 * (0.5 + lon / 360), W0 * (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI))];
  };
  const fromWorld = (x, y) => {
    const n = Math.PI - (2 * Math.PI * y) / W0;
    return [(180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), (x / W0) * 360 - 180];
  };

  /* ------------------------------------------------------------------ */
  /* Thin-plate spline                                                   */
  /* ------------------------------------------------------------------ */
  function solve(A, B) {
    // Gaussian elimination with partial pivoting; A (n x n), B (n x m)
    const n = A.length, m = B[0].length;
    const M = A.map((r, i) => r.concat(B[i]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-12) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        if (f) for (let k = c; k < n + m; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((r, i) => r.slice(n).map((v) => v / M[i][i]));
  }
  const U = (r2) => (r2 > 0 ? r2 * Math.log(r2) : 0);

  class TPS {
    constructor(src, dst) {
      const n = src.length;
      let mx = 0, my = 0;
      src.forEach((p) => { mx += p[0]; my += p[1]; });
      mx /= n; my /= n;
      let sd = 0;
      src.forEach((p) => { sd += (p[0] - mx) ** 2 + (p[1] - my) ** 2; });
      sd = Math.sqrt(sd / (2 * n)) || 1;
      this.mx = mx; this.my = my; this.sd = sd;
      this.s = src.map((p) => [(p[0] - mx) / sd, (p[1] - my) / sd]);
      const A = [];
      for (let i = 0; i < n + 3; i++) A.push(new Array(n + 3).fill(0));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) { const dx = this.s[i][0] - this.s[j][0], dy = this.s[i][1] - this.s[j][1]; A[i][j] = U(dx * dx + dy * dy); }
        A[i][n] = A[n][i] = 1; A[i][n + 1] = A[n + 1][i] = this.s[i][0]; A[i][n + 2] = A[n + 2][i] = this.s[i][1];
      }
      const B = dst.map((p) => [p[0], p[1]]).concat([[0, 0], [0, 0], [0, 0]]);
      this.w = solve(A, B);
      this.ok = !!this.w;
    }
    map(x, y) {
      const n = this.s.length, w = this.w;
      const qx = (x - this.mx) / this.sd, qy = (y - this.my) / this.sd;
      let ox = w[n][0] + w[n + 1][0] * qx + w[n + 2][0] * qy;
      let oy = w[n][1] + w[n + 1][1] * qx + w[n + 2][1] * qy;
      for (let i = 0; i < n; i++) {
        const dx = qx - this.s[i][0], dy = qy - this.s[i][1], u = U(dx * dx + dy * dy);
        ox += w[i][0] * u; oy += w[i][1] * u;
      }
      return [ox, oy];
    }
  }

  // px -> world(zoom 0) spline from control points; null if < 3 usable points
  function fitForward(points) {
    const use = points.filter((p) => p.enabled !== false);
    if (use.length < 3) return null;
    const t = new TPS(use.map((p) => p.px), use.map((p) => toWorld(p.lat, p.lon)));
    return t.ok ? t : null;
  }

  // Leave-one-out prediction error (km) for each enabled point
  function looErrors(points) {
    const use = points.filter((p) => p.enabled !== false);
    const out = new Map();
    if (use.length < 4) return out;
    for (const p of use) {
      const rest = use.filter((q) => q !== p);
      const t = new TPS(rest.map((q) => q.px), rest.map((q) => toWorld(q.lat, q.lon)));
      if (!t.ok) continue;
      const [x, y] = t.map(p.px[0], p.px[1]);
      const [lat, lon] = fromWorld(x, y);
      const dy = (lat - p.lat) * 110.57, dx = (lon - p.lon) * 111.32 * Math.cos((p.lat * Math.PI) / 180);
      out.set(p, Math.hypot(dx, dy));
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Warp layer: triangle mesh on a canvas                               */
  /* ------------------------------------------------------------------ */
  const WarpLayer = L.Layer.extend({
    options: { opacity: 0.75, pane: "hist", cells: 32 },
    initialize(imageUrl, gcp, opts) {
      L.setOptions(this, opts);
      this._url = imageUrl; this._img = new Image(); this._ready = false;
      this._img.onload = () => {
        // Draw from a working copy of at most ~4096 px: faster, and within GPU texture limits.
        const w0 = this._img.naturalWidth, h0 = this._img.naturalHeight, k = Math.min(1, 4096 / Math.max(w0, h0));
        if (k < 1) {
          const cv = document.createElement("canvas");
          cv.width = Math.round(w0 * k); cv.height = Math.round(h0 * k);
          cv.getContext("2d").drawImage(this._img, 0, 0, cv.width, cv.height);
          this._src = cv;
        } else this._src = this._img;
        this._srcW = this._src.width || this._src.naturalWidth;
        this._ready = true; this._buildMesh(); this._redraw();
      };
      this._img.src = imageUrl;
      this.setGcp(gcp);
    },
    setGcp(gcp) {
      this._gcp = gcp;
      this._tps = fitForward(gcp.points);
      if (this._ready) this._buildMesh();
      this._redraw();
    },
    setOpacity(o) { this.options.opacity = o; if (this._cv) this._cv.style.opacity = o; },
    onAdd(map) {
      this._cv = L.DomUtil.create("canvas", "warp-canvas");
      this._cv.style.position = "absolute";
      this._cv.style.pointerEvents = "none";
      this._cv.style.opacity = this.options.opacity;
      map.getPane(this.options.pane).appendChild(this._cv);
      map.on("moveend zoomend resize viewreset", this._redraw, this);
      map.on("zoomstart", this._hide, this);
      this._redraw();
    },
    onRemove(map) {
      map.off("moveend zoomend resize viewreset", this._redraw, this);
      map.off("zoomstart", this._hide, this);
      this._cv.remove(); this._cv = null;
    },
    _hide() { if (this._cv) this._cv.style.visibility = "hidden"; },
    _buildMesh() {
      this._mesh = null;
      if (!this._tps || !this._ready) return;
      const W = this._srcW, H = this._src.height || this._src.naturalHeight;
      const g = this._gcp, sc = g.image_size ? W / g.image_size[0] : W / this._img.naturalWidth; // gcp pixels -> working-copy pixels
      const mask = (g.mask || [[0, 0], [W / sc, 0], [W / sc, H / sc], [0, H / sc]]);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      mask.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
      const nx = this.options.cells, ny = Math.max(4, Math.round((nx * (y1 - y0)) / (x1 - x0)));
      const V = [];
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const px = x0 + ((x1 - x0) * i) / nx, py = y0 + ((y1 - y0) * j) / ny;
        V.push({ px, py, w: this._tps.map(px, py) });
      }
      // mask outline mapped through the spline (densified)
      const outline = [];
      for (let k = 0; k < mask.length; k++) {
        const a = mask[k], b = mask[(k + 1) % mask.length];
        for (let t = 0; t < 1; t += 1 / 40) {
          const px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
          outline.push(this._tps.map(px, py));
        }
      }
      this._mesh = { V, nx, ny, sc, outline };
    },
    _redraw() {
      const t0 = performance.now();
      const map = this._map;
      if (!map || !this._cv) return;
      const size = map.getSize(), tl = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._cv, tl);
      const dpr = window.devicePixelRatio || 1;
      this._cv.width = size.x * dpr; this._cv.height = size.y * dpr;
      this._cv.style.width = size.x + "px"; this._cv.style.height = size.y + "px";
      this._cv.style.visibility = "visible";
      const ctx = this._cv.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this._cv.width, this._cv.height);
      if (!this._mesh) return;
      const s = Math.pow(2, map.getZoom()), o = map.getPixelOrigin();
      const ox = o.x + tl.x, oy = o.y + tl.y; // world(z) -> canvas
      const P = (w) => [(w[0] * s - ox) * dpr, (w[1] * s - oy) * dpr];
      const { V, nx, ny, sc, outline } = this._mesh, img = this._src;
      // clip to the mapped neatline
      ctx.save();
      ctx.beginPath();
      outline.forEach((w, k) => { const p = P(w); if (k) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
      ctx.closePath(); ctx.clip();
      const cw = this._cv.width, ch = this._cv.height;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const a = V[j * (nx + 1) + i], b = V[j * (nx + 1) + i + 1], c = V[(j + 1) * (nx + 1) + i], d = V[(j + 1) * (nx + 1) + i + 1];
        const pa = P(a.w), pb = P(b.w), pc = P(c.w), pd = P(d.w);
        const minX = Math.min(pa[0], pb[0], pc[0], pd[0]), maxX = Math.max(pa[0], pb[0], pc[0], pd[0]);
        const minY = Math.min(pa[1], pb[1], pc[1], pd[1]), maxY = Math.max(pa[1], pb[1], pc[1], pd[1]);
        if (maxX < 0 || maxY < 0 || minX > cw || minY > ch) continue;
        tri(ctx, img, sc, a, b, c, pa, pb, pc);
        tri(ctx, img, sc, b, d, c, pb, pd, pc);
      }
      ctx.restore();
      this.lastDrawMs = Math.round(performance.now() - t0);
    },
  });

  // Draw source triangle (a,b,c in scan px) onto destination triangle (pa,pb,pc)
  function tri(ctx, img, sc, a, b, c, pa, pb, pc) {
    const sx0 = a.px * sc, sy0 = a.py * sc, sx1 = b.px * sc, sy1 = b.py * sc, sx2 = c.px * sc, sy2 = c.py * sc;
    const den = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
    if (!den) return;
    const m11 = (pa[0] * (sy1 - sy2) + pb[0] * (sy2 - sy0) + pc[0] * (sy0 - sy1)) / den;
    const m12 = (pa[0] * (sx2 - sx1) + pb[0] * (sx0 - sx2) + pc[0] * (sx1 - sx0)) / den;
    const m13 = (pa[0] * (sx1 * sy2 - sx2 * sy1) + pb[0] * (sx2 * sy0 - sx0 * sy2) + pc[0] * (sx0 * sy1 - sx1 * sy0)) / den;
    const m21 = (pa[1] * (sy1 - sy2) + pb[1] * (sy2 - sy0) + pc[1] * (sy0 - sy1)) / den;
    const m22 = (pa[1] * (sx2 - sx1) + pb[1] * (sx0 - sx2) + pc[1] * (sx1 - sx0)) / den;
    const m23 = (pa[1] * (sx1 * sy2 - sx2 * sy1) + pb[1] * (sx2 * sy0 - sx0 * sy2) + pc[1] * (sx0 * sy1 - sx1 * sy0)) / den;
    // expand the clip triangle ~0.7 px to hide seams between triangles
    const cx = (pa[0] + pb[0] + pc[0]) / 3, cy = (pa[1] + pb[1] + pc[1]) / 3;
    const grow = (p) => { const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy) || 1; return [p[0] + (dx / l) * 0.7, p[1] + (dy / l) * 0.7]; };
    const [qa, qb, qc] = [grow(pa), grow(pb), grow(pc)];
    ctx.save();
    ctx.beginPath(); ctx.moveTo(qa[0], qa[1]); ctx.lineTo(qb[0], qb[1]); ctx.lineTo(qc[0], qc[1]); ctx.closePath(); ctx.clip();
    ctx.setTransform(m11, m21, m12, m22, m13, m23);
    const x0 = Math.max(0, Math.floor(Math.min(sx0, sx1, sx2)) - 2), y0 = Math.max(0, Math.floor(Math.min(sy0, sy1, sy2)) - 2);
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const x1 = Math.min(iw, Math.ceil(Math.max(sx0, sx1, sx2)) + 2), y1 = Math.min(ih, Math.ceil(Math.max(sy0, sy1, sy2)) + 2);
    if (x1 > x0 && y1 > y0) ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }

  /* ------------------------------------------------------------------ */
  /* Editor                                                              */
  /* ------------------------------------------------------------------ */
  function createEditor({ map, root, onChange, onClose, esc }) {
    const $ = (s) => root.querySelector(s);
    const view = $(".gv"), list = $(".gl");
    let m = null, gcp = null, layer = null, markers = L.layerGroup(), sel = null, adding = null, errs = new Map();
    let T = { s: 1, x: 0, y: 0 }, img = null, W = 0, H = 0, sc = 1;
    const errColor = (e) => (e == null ? "#9e9e9e" : e < 10 ? "#43a047" : e < 25 ? "#fdd835" : e < 50 ? "#fb8c00" : "#e53935");

    function open(mapEntry, gcpData, opacity) {
      m = mapEntry;
      gcp = JSON.parse(JSON.stringify(gcpData));
      gcp.points.forEach((p) => { if (p.enabled == null) p.enabled = true; });
      root.classList.add("open");
      $(".gt").textContent = `Control points · ${m.title} (${m.year})`;
      view.innerHTML = "";
      img = new Image();
      img.onload = () => {
        W = img.naturalWidth; H = img.naturalHeight; sc = gcp.image_size ? W / gcp.image_size[0] : 1;
        const vw = view.clientWidth, vh = view.clientHeight;
        T.s = Math.min(vw / W, vh / H); T.x = (vw - W * T.s) / 2; T.y = (vh - H * T.s) / 2;
        render();
      };
      img.src = m.original;
      img.className = "gimg";
      view.appendChild(img);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "gmask");
      view.appendChild(svg);
      layer = new WarpLayer(m.original, gcp, { opacity: opacity == null ? 0.75 : opacity }).addTo(map);
      markers.addTo(map);
      recompute();
    }
    function close() {
      root.classList.remove("open");
      if (layer) map.removeLayer(layer);
      markers.clearLayers(); map.removeLayer(markers);
      layer = null; m = null; adding = null; sel = null;
      onClose && onClose();
    }
    function recompute(light) {
      errs = looErrors(gcp.points);
      if (layer) layer.setGcp(gcp);
      if (!light) drawMarkers();
      render();
      onChange && onChange(m, gcp, stats());
    }
    function stats() {
      const v = [...errs.values()];
      return { n: gcp.points.filter((p) => p.enabled !== false).length, rms: v.length ? Math.sqrt(v.reduce((s, e) => s + e * e, 0) / v.length) : null };
    }

    /* ---- scan viewer ---- */
    function render() {
      if (!img) return;
      img.style.transform = `translate(${T.x}px,${T.y}px) scale(${T.s})`;
      view.querySelectorAll(".gp").forEach((e) => e.remove());
      gcp.points.forEach((p, i) => {
        const d = document.createElement("div");
        d.className = "gp" + (p === sel ? " sel" : "") + (p.enabled === false ? " off" : "");
        d.textContent = i + 1;
        d.style.left = T.x + p.px[0] * sc * T.s + "px"; d.style.top = T.y + p.px[1] * sc * T.s + "px";
        d.style.borderColor = errColor(errs.get(p));
        d.dataset.i = i;
        d.title = p.name || "";
        view.appendChild(d);
      });
      if (adding && adding.px) {
        const d = document.createElement("div");
        d.className = "gp pending"; d.textContent = "+";
        d.style.left = T.x + adding.px[0] * sc * T.s + "px"; d.style.top = T.y + adding.px[1] * sc * T.s + "px";
        view.appendChild(d);
      }
      const svg = view.querySelector(".gmask");
      if (svg && gcp.mask) {
        svg.setAttribute("width", view.clientWidth); svg.setAttribute("height", view.clientHeight);
        svg.innerHTML = `<polygon points="${gcp.mask.map(([x, y]) => `${T.x + x * sc * T.s},${T.y + y * sc * T.s}`).join(" ")}" fill="none" stroke="#ffd54f" stroke-dasharray="6 4" stroke-width="1.5"/>`;
      }
      renderList();
      status();
    }
    let drag = null;
    view.addEventListener("pointerdown", (e) => {
      const r = view.getBoundingClientRect();
      const t = e.target.closest(".gp");
      drag = { sx: e.clientX, sy: e.clientY, tx: T.x, ty: T.y, moved: false, pt: t && t.dataset.i != null ? gcp.points[+t.dataset.i] : null, r };
      view.setPointerCapture(e.pointerId);
    });
    view.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (!drag.moved) return;
      if (drag.pt) {
        drag.pt.px = [+(((e.clientX - drag.r.left - T.x) / T.s) / sc).toFixed(1), +(((e.clientY - drag.r.top - T.y) / T.s) / sc).toFixed(1)];
        sel = drag.pt;
        render();
      } else { T.x = drag.tx + dx; T.y = drag.ty + dy; render(); }
    });
    view.addEventListener("pointerup", (e) => {
      const d = drag; drag = null;
      if (!d) return;
      if (d.pt && d.moved) { recompute(); return; }
      if (d.pt && !d.moved) { select(d.pt, true); return; }
      if (!d.moved && adding) {
        adding.px = [+(((e.clientX - d.r.left - T.x) / T.s) / sc).toFixed(1), +(((e.clientY - d.r.top - T.y) / T.s) / sc).toFixed(1)];
        status(); render();
      }
    });
    view.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = view.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k = e.deltaY < 0 ? 1.25 : 1 / 1.25;
      T.x = mx - (mx - T.x) * k; T.y = my - (my - T.y) * k; T.s *= k; render();
    }, { passive: false });

    /* ---- map markers ---- */
    function drawMarkers() {
      markers.clearLayers();
      gcp.points.forEach((p, i) => {
        const mk = L.marker([p.lat, p.lon], {
          pane: "log", draggable: true, title: p.name || "",
          icon: L.divIcon({ className: "gcp-pin" + (p === sel ? " sel" : "") + (p.enabled === false ? " off" : ""),
            html: `<b style="background:${errColor(errs.get(p))}">${i + 1}</b>`, iconSize: [22, 22] }),
        });
        mk.on("dragend", () => { const ll = mk.getLatLng(); p.lat = +ll.lat.toFixed(6); p.lon = +ll.lng.toFixed(6); sel = p; recompute(); });
        mk.on("click", () => select(p, false));
        markers.addLayer(mk);
      });
    }
    function select(p, panMap) {
      sel = p;
      if (panMap) map.panTo([p.lat, p.lon]);
      else {
        const vw = view.clientWidth, vh = view.clientHeight;
        T.x = vw / 2 - p.px[0] * sc * T.s; T.y = vh / 2 - p.px[1] * sc * T.s;
      }
      drawMarkers(); render();
      const row = list.querySelector(`[data-i="${gcp.points.indexOf(p)}"]`);
      if (row) row.scrollIntoView({ block: "nearest" });
    }
    function handleMapClick(latlng) {
      if (!m) return false;
      if (adding && adding.px) {
        const p = { name: adding.name || `Point ${gcp.points.length + 1}`, px: adding.px, lat: +latlng.lat.toFixed(6), lon: +latlng.lng.toFixed(6), enabled: true };
        gcp.points.push(p); adding = null; sel = p;
        $(".gadd").classList.remove("active");
        recompute();
      }
      return true; // swallow map clicks while editing
    }

    /* ---- list ---- */
    function renderList() {
      const rows = gcp.points.map((p, i) => ({ p, i, e: errs.get(p) }));
      list.innerHTML = rows.map(({ p, i, e }) => `<div class="gr${p === sel ? " sel" : ""}" data-i="${i}">
          <span class="gn" style="background:${errColor(e)}">${i + 1}</span>
          <input class="gname" value="${esc(p.name || "")}" title="Name">
          <span class="ge">${e == null ? "—" : e.toFixed(0) + " km"}</span>
          <input type="checkbox" class="gon" ${p.enabled !== false ? "checked" : ""} title="Use this point">
          <button class="gdel" title="Delete">✕</button></div>`).join("");
      list.querySelectorAll(".gr").forEach((row) => {
        const p = gcp.points[+row.dataset.i];
        row.addEventListener("click", (e) => { if (!e.target.closest("input,button")) select(p, true); });
        row.querySelector(".gname").addEventListener("change", (e) => { p.name = e.target.value; recompute(true); });
        row.querySelector(".gon").addEventListener("change", (e) => { p.enabled = e.target.checked; recompute(); });
        row.querySelector(".gdel").addEventListener("click", () => { if (confirm(`Delete point ${+row.dataset.i + 1} (${p.name})?`)) { gcp.points.splice(+row.dataset.i, 1); if (sel === p) sel = null; recompute(); } });
      });
    }
    function status() {
      const st = stats();
      $(".gs").textContent = adding ? (adding.px ? "Now click the same place on the map." : "Click the point on the scan.")
        : `${st.n} points in use · typical error ${st.rms == null ? "—" : st.rms.toFixed(1) + " km"} (leave-one-out) · drag points on the scan or the map`;
    }

    /* ---- buttons ---- */
    $(".gadd").addEventListener("click", () => { adding = adding ? null : {}; $(".gadd").classList.toggle("active", !!adding); render(); });
    $(".gclose").addEventListener("click", close);
    $(".gfit").addEventListener("click", () => { const vw = view.clientWidth, vh = view.clientHeight; T.s = Math.min(vw / W, vh / H); T.x = (vw - W * T.s) / 2; T.y = (vh - H * T.s) / 2; render(); });

    return {
      open, close, handleMapClick, get active() { return !!m; }, get gcp() { return gcp; }, get map() { return m; }, get layer() { return layer; },
      setOpacity(o) { if (layer) layer.setOpacity(o); },
      replace(newGcp) { gcp = JSON.parse(JSON.stringify(newGcp)); gcp.points.forEach((p) => { if (p.enabled == null) p.enabled = true; }); sel = null; recompute(); },
    };
  }

  /* ---- QGIS .points import / export ---- */
  function toQgisPoints(gcp) {
    return "#CRS: EPSG:4326\nmapX,mapY,sourceX,sourceY,enable,dX,dY,residual\n" +
      gcp.points.map((p) => `${p.lon},${p.lat},${p.px[0]},${-p.px[1]},${p.enabled === false ? 0 : 1},0,0,0`).join("\n") + "\n";
  }
  function fromQgisPoints(text, base) {
    const rows = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
    const head = rows.shift().split(",").map((h) => h.trim());
    const ix = (k) => head.indexOf(k);
    const pts = rows.map((r, i) => {
      const c = r.split(",").map(Number);
      return { name: `Point ${i + 1}`, px: [c[ix("sourceX")], -c[ix("sourceY")]], lat: c[ix("mapY")], lon: c[ix("mapX")], enabled: c[ix("enable")] !== 0 };
    }).filter((p) => isFinite(p.lat) && isFinite(p.px[0]));
    // keep names from the existing set where positions match closely
    if (base) pts.forEach((p) => { const q = base.points.find((b) => Math.hypot(b.px[0] - p.px[0], b.px[1] - p.px[1]) < 3); if (q) p.name = q.name; });
    return Object.assign({}, base, { points: pts });
  }

  window.ARGcp = { TPS, WarpLayer, createEditor, looErrors, toQgisPoints, fromQgisPoints, toWorld, fromWorld };
})();
