/*
 * Historical maps:
 *   - online tile (XYZ) and WMS layers configured by the user
 *   - local scans georeferenced in the browser with control points
 *     (affine least-squares fit, stored in IndexedDB)
 *   - a swipe control to compare historical layers with the basemap
 */
(function () {
  "use strict";

  /* ---------------- IndexedDB for scan images ---------------- */
  const DB_NAME = "archeo_ua", STORE = "scans";
  function db() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbPut(obj) {
    const d = await db();
    return new Promise((res, rej) => { const t = d.transaction(STORE, "readwrite"); t.objectStore(STORE).put(obj); t.oncomplete = res; t.onerror = () => rej(t.error); });
  }
  async function idbAll() {
    const d = await db();
    return new Promise((res, rej) => { const q = d.transaction(STORE).objectStore(STORE).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  }
  async function idbDel(id) {
    const d = await db();
    return new Promise((res, rej) => { const t = d.transaction(STORE, "readwrite"); t.objectStore(STORE).delete(id); t.oncomplete = res; t.onerror = () => rej(t.error); });
  }

  /* ---------------- Affine fit ---------------- */
  // Solve [X Y] = [x y 1] * M for M (3x2) by least squares; needs >= 3 points.
  function fitAffine(src, dst) {
    const n = src.length;
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const v = [src[i][0], src[i][1], 1];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) A[r][c] += v[r] * v[c];
        bx[r] += v[r] * dst[i][0]; by[r] += v[r] * dst[i][1];
      }
    }
    const inv = inv3(A);
    if (!inv) return null;
    const mx = mul3(inv, bx), my = mul3(inv, by);
    // residuals
    let rms = 0;
    for (let i = 0; i < n; i++) {
      const X = mx[0] * src[i][0] + mx[1] * src[i][1] + mx[2];
      const Y = my[0] * src[i][0] + my[1] * src[i][1] + my[2];
      rms += (X - dst[i][0]) ** 2 + (Y - dst[i][1]) ** 2;
    }
    return { a: mx[0], c: mx[1], e: mx[2], b: my[0], d: my[1], f: my[2], rms: Math.sqrt(rms / n) };
  }
  function inv3(m) {
    const [a, b, c] = m[0], [d, e, f] = m[1], [g, h, i] = m[2];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) return null;
    return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
            [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
            [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
  }
  function mul3(m, v) { return m.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]); }

  /* ---------------- Affine image layer ---------------- */
  // M maps image pixels to Web-Mercator world pixels at zoom 0.
  const AffineImage = L.Layer.extend({
    initialize(url, M, opts) { this._url = url; this._M = M; L.setOptions(this, opts); },
    onAdd(map) {
      this._img = L.DomUtil.create("img", "affine-img");
      this._img.src = this._url;
      this._img.style.opacity = this.options.opacity == null ? 0.7 : this.options.opacity;
      this.getPane().appendChild(this._img);
      map.on("zoomend viewreset", this._update, this);
      map.on("zoomstart", this._hide, this);
      this._update();
    },
    onRemove(map) {
      map.off("zoomend viewreset", this._update, this);
      map.off("zoomstart", this._hide, this);
      this._img.remove();
    },
    getPane() { return this._map.getPane(this.options.pane || "overlayPane"); },
    setOpacity(o) { this.options.opacity = o; if (this._img) this._img.style.opacity = o; },
    _hide() { if (this._img) this._img.style.visibility = "hidden"; },
    _update() {
      const map = this._map, s = Math.pow(2, map.getZoom()), o = map.getPixelOrigin(), M = this._M;
      this._img.style.transform = `matrix(${M.a * s},${M.b * s},${M.c * s},${M.d * s},${M.e * s - o.x},${M.f * s - o.y})`;
      this._img.style.visibility = "visible";
    },
  });

  /* ---------------- Swipe ---------------- */
  function Swipe(map, paneName) {
    this.map = map; this.pane = map.getPane(paneName); this.frac = 0.5; this.on = false;
    const el = (this.el = L.DomUtil.create("div", "swipe", map.getContainer()));
    el.innerHTML = '<div class="swipe-handle" title="Drag to compare"></div>';
    L.DomEvent.disableClickPropagation(el);
    let drag = false;
    el.addEventListener("pointerdown", (e) => { drag = true; el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointerup", () => { drag = false; });
    el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const r = map.getContainer().getBoundingClientRect();
      this.frac = Math.min(0.98, Math.max(0.02, (e.clientX - r.left) / r.width));
      this.update();
    });
    map.on("move zoomend resize", () => this.update());
  }
  Swipe.prototype.set = function (on) { this.on = on; this.el.style.display = on ? "block" : "none"; this.update(); };
  Swipe.prototype.update = function () {
    if (!this.on) { this.pane.style.clipPath = ""; return; }
    const size = this.map.getSize(), x = size.x * this.frac;
    const tl = this.map.containerPointToLayerPoint([0, 0]);
    this.pane.style.clipPath = `polygon(${tl.x}px ${tl.y}px, ${tl.x + x}px ${tl.y}px, ${tl.x + x}px ${tl.y + size.y}px, ${tl.x}px ${tl.y + size.y}px)`;
    this.el.style.left = x + "px";
  };

  window.ARHist = { idbPut, idbAll, idbDel, fitAffine, AffineImage, Swipe };
})();
