/* Archeo UA — archaeological landscape & site-potential explorer. */
(function () {
  "use strict";

  const BASE = window.GR_BASE, PERIODS = window.AR_PERIODS, ZONES = window.AR_ZONES;
  const { LANDFORMS, estimate, calibrator } = window.ARDepth;
  const { Raster, renderOverlay, peaks } = window.ARRasters;
  const H = window.ARHist;

  /* ------------------------------------------------------------------ */
  /* Helpers                                                             */
  /* ------------------------------------------------------------------ */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (v, d = 2) => Number(v).toFixed(d);
  const ll = (lat, lon) => `${fmt(lat, 5)}, ${fmt(lon, 5)}`;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { alert("Could not save to browser storage: " + e.message); } },
  };
  const uid = () => Math.random().toString(36).slice(2, 10);
  function distKm(lat1, lon1, lat2, lon2) {
    const dx = (lon2 - lon1) * 111.32 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180), dy = (lat2 - lat1) * 110.57;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function pointInRing(lat, lon, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function distToSegKm(lat, lon, a, b) {
    const kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.57;
    const px = lon * kx, py = lat * ky, ax = a[1] * kx, ay = a[0] * ky, bx = b[1] * kx, by = b[0] * ky;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  }
  const yearStr = (y) => (y < 0 ? `${Math.abs(y).toLocaleString()} BCE` : `${y} CE`);

  /* ------------------------------------------------------------------ */
  /* Periods                                                             */
  /* ------------------------------------------------------------------ */
  const PBY = Object.fromEntries(PERIODS.map((p, i) => [p.id, Object.assign(p, { idx: i })]));
  const pState = store.get("ar_periods", { on: PERIODS.map((p) => p.id), from: 0, to: PERIODS.length - 1, undated: true });
  const periodActive = (id) => { const p = PBY[id]; return p && pState.on.includes(id) && p.idx >= pState.from && p.idx <= pState.to; };
  function periodsForYears(a, b) {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return PERIODS.filter((p) => p.from <= hi && p.to >= lo).map((p) => p.id);
  }
  function parsePeriods(v) {
    if (v == null || v === "") return [];
    const out = new Set();
    String(v).split(/[;|,]/).map((s) => s.trim()).filter(Boolean).forEach((s) => {
      const m = s.match(/^(-?\d+)\s*\.\.\s*(-?\d+)$/);
      if (m) { periodsForYears(+m[1], +m[2]).forEach((x) => out.add(x)); return; }
      if (/^-?\d+$/.test(s)) { periodsForYears(+s, +s).forEach((x) => out.add(x)); return; }
      if (PBY[s]) { out.add(s); return; }
      const low = s.toLowerCase();
      const hit = PERIODS.find((p) => p.name.toLowerCase().includes(low) || p.name_uk.toLowerCase().includes(low) || p.cultures.toLowerCase().includes(low));
      if (hit) out.add(hit.id);
    });
    return [...out].sort((a, b) => PBY[a].idx - PBY[b].idx);
  }

  function zoneAt(lat, lon) { return ZONES.find((z) => pointInRing(lat, lon, z.poly)) || null; }

  /* ------------------------------------------------------------------ */
  /* Map                                                                 */
  /* ------------------------------------------------------------------ */
  const saved = store.get("ar_view", null);
  const map = L.map("map", { preferCanvas: true, zoomSnap: 0.5 }).setView(saved ? saved.c : [48.8, 31.2], saved ? saved.z : 6);
  map.on("moveend", () => store.set("ar_view", { c: [map.getCenter().lat, map.getCenter().lng], z: map.getZoom() }));
  const bases = {
    "Topographic (OpenTopoMap)": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)" }),
    "Satellite (Esri)": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imagery © Esri, Maxar, Earthstar Geographics" }),
    "OpenStreetMap": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }),
    "Offline (no tiles)": L.layerGroup(),
  };
  (bases[store.get("ar_base", "Satellite (Esri)")] || bases["Satellite (Esri)"]).addTo(map);
  map.on("baselayerchange", (e) => store.set("ar_base", e.name));
  L.control.layers(bases, null, { position: "topright" }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  [["relief", 330], ["hist", 340], ["landform", 345], ["pot", 350], ["streams", 400], ["admin", 390], ["draw", 600], ["sites", 620], ["survey", 640], ["log", 650]]
    .forEach(([n, z]) => { map.createPane(n).style.zIndex = z; });
  ["relief", "hist", "landform", "pot"].forEach((n) => { map.getPane(n).style.pointerEvents = "none"; });
  map.getPane("relief").style.mixBlendMode = "multiply";
  map.on("mousemove", (e) => { $("#coords").textContent = `${fmt(e.latlng.lat, 5)}°N  ${fmt(e.latlng.lng, 5)}°E · z${map.getZoom()}`; });

  /* ------------------------------------------------------------------ */
  /* Rasters                                                             */
  /* ------------------------------------------------------------------ */
  let rasters = [];
  function rasterAt(lat, lon) {
    let best = null;
    for (const r of rasters) if (r.covers(lat, lon) && (!best || r.res_m < best.res_m)) best = r;
    return best;
  }
  function sampleAt(lat, lon) { const r = rasterAt(lat, lon); return r ? r.sample(lat, lon) : null; }

  const L_ = {};
  L_.pot_barrow = L.layerGroup(); L_.pot_settlement = L.layerGroup(); L_.pot_hillfort = L.layerGroup();
  L_.landform = L.layerGroup(); L_.streams = L.layerGroup();
  L_.relief = L.imageOverlay("data/relief_ua.webp", [[44.3, 22.0], [52.4, 40.3]], { pane: "relief", opacity: 0.7, interactive: false });
  L_.admin = L.layerGroup([
    L.geoJSON(BASE.oblasts, { pane: "admin", interactive: false, style: { color: "#c9c3b5", weight: 0.7, opacity: 0.6, fill: false, dashArray: "3 3" } }),
    L.geoJSON(BASE.border, { pane: "admin", interactive: false, style: { color: "#d7a86e", weight: 2, opacity: 0.9, fill: false } }),
  ]);
  L_.zones = L.layerGroup(ZONES.map((z) => L.polygon(z.poly, { pane: "admin", color: z.color, weight: 1, fillColor: z.color, fillOpacity: 0.12, interactive: false })
    .bindTooltip(z.name, { sticky: true })));
  L_.places = L.layerGroup(BASE.places.filter((p) => p.r <= 8).map((p) => L.circleMarker([p.lat, p.lon], { pane: "admin", radius: 2.5, color: "#e8e6e1", weight: 1, fillOpacity: 1, interactive: false })
    .bindTooltip(p.n, { permanent: p.r <= 3, direction: "right", className: "river-label" })));
  L_.studyAreas = L.layerGroup();

  const POT = [
    { key: "pot_barrow", band: 0, label: "Barrow potential", rgb: [230, 90, 40] },
    { key: "pot_settlement", band: 1, label: "Settlement potential", rgb: [60, 190, 90] },
    { key: "pot_hillfort", band: 2, label: "Hillfort potential", rgb: [170, 90, 230] },
  ];
  const LF_RGB = LANDFORMS.map((l) => [parseInt(l.color.slice(1, 3), 16), parseInt(l.color.slice(3, 5), 16), parseInt(l.color.slice(5, 7), 16)]);
  let overlayOpacity = store.get("ar_op", 0.6);

  // Potential overlays, showing only cells at or above the threshold.
  let potMin = store.get("ar_potmin", 0.35);
  function buildPotentials() {
    POT.forEach((p) => L_[p.key].clearLayers());
    const thr = Math.round(potMin * 255);
    for (const r of rasters) {
      for (const p of POT) {
        const ov = renderOverlay(r, (R, i) => {
          const v = R.P[i + p.band];
          if (v < thr) return null;
          const t = (v - thr) / Math.max(1, 255 - thr);
          return [p.rgb[0], p.rgb[1], p.rgb[2], Math.round(90 + 165 * t)];
        }, 2800);
        L_[p.key].addLayer(L.imageOverlay(ov.url, ov.bounds, { pane: "pot", opacity: overlayOpacity, interactive: false }));
      }
    }
  }

  async function loadRasters() {
    const metas = Object.values(window.AR_RASTERS || {});
    rasters = await Promise.all(metas.map((m) => new Raster(m).load()));
    rasters.sort((a, b) => b.res_m - a.res_m); // coarse first, fine drawn on top
    buildPotentials();
    for (const r of rasters) {
      const lf = renderOverlay(r, (R, i) => { const c = LF_RGB[R.T[i]]; return R.T[i] === 0 ? null : [c[0], c[1], c[2], 170]; }, 2800);
      L_.landform.addLayer(L.imageOverlay(lf.url, lf.bounds, { pane: "landform", opacity: overlayOpacity, interactive: false }));
      if (r.res_m < 200) {
        L_.studyAreas.addLayer(L.rectangle([[r.s, r.w], [r.n, r.e]], { pane: "admin", color: "#d7a86e", weight: 2, dashArray: "6 4", fill: false, interactive: false })
          .bindTooltip(`Study area ${r.name} (~${r.res_m} m)`, { permanent: false }));
      }
    }
    // Streams (study-area streams replace national ones inside their box)
    const study = rasters.filter((r) => r.res_m < 200);
    const canvas = L.canvas({ pane: "streams", padding: 0.3 });
    for (const [name, list] of Object.entries(window.AR_STREAMS || {})) {
      const isStudy = name !== "ukraine";
      for (const s of list) {
        const pts = s.y.map((y, k) => [y / 1e4, s.x[k] / 1e4]);
        const mid = pts[pts.length >> 1];
        if (!isStudy && study.some((r) => r.covers(mid[0], mid[1]))) continue;
        const w = Math.min(3.5, Math.max(0.6, 0.3 + Math.log10(s.a) * 0.7));
        L_.streams.addLayer(L.polyline(pts, { renderer: canvas, color: "#4fa3d9", weight: w, opacity: 0.8, interactive: false }));
      }
    }
    $("#loading").remove();
    applyLayers();
    refreshCalibration();
  }

  /* ------------------------------------------------------------------ */
  /* Sites                                                               */
  /* ------------------------------------------------------------------ */
  const SOURCES = { curated: "Curated (published)", imported: "Imported", osm: "OpenStreetMap", wikidata: "Wikidata", mapfeature: "Digitised from old maps", detected: "Detected in imagery (confirmed)" };
  const TYPE_R = { city: 8, hillfort: 7, fortress: 7, barrow: 6, settlement: 6 };
  let imported = store.get("ar_imported", []);
  let digitised = store.get("ar_digitised", []);
  let online = []; // OSM + Wikidata, session only
  const curated = window.AR_SITES.map((s) => Object.assign({ source: "curated", confidence: "documented" }, s));
  const allSites = () => curated.concat(imported, digitised, online, detectedSites());

  function siteVisible(s) {
    if (!s.periods || !s.periods.length) return pState.undated;
    return s.periods.some(periodActive);
  }
  function siteColor(s) {
    const p = (s.periods || []).find(periodActive);
    return p ? PBY[p].color : "#9e9e9e";
  }
  function sitePopup(s) {
    const per = (s.periods || []).map((id) => `<span class="tag" style="background:${PBY[id].color};color:#111">${esc(PBY[id].name)}</span>`).join("") || `<span class="tag">undated</span>`;
    const smp = sampleAt(s.lat, s.lon);
    return `<h4>${esc(s.name)}</h4>${s.name_uk ? `<div class="meta">${esc(s.name_uk)}</div>` : ""}
      <div>${per}</div>
      <dl class="kv" style="margin-top:8px">
        <dt>Type</dt><dd>${esc(s.type || "—")}</dd>
        <dt>Source</dt><dd>${esc(SOURCES[s.source] || s.source)}${s.url ? ` · <a href="${esc(s.url)}" target="_blank" rel="noopener">link</a>` : ""}</dd>
        <dt>Position</dt><dd>${ll(s.lat, s.lon)}${s.acc ? ` ± ${s.acc} km` : ""}</dd>
        ${s.mapYear ? `<dt>Mapped</dt><dd>${esc(s.mapName || "")} ${s.mapYear}${s.vanished ? " · vanished today" : ""}</dd>` : ""}
        ${s.depth ? `<dt>Recorded depth</dt><dd>${s.depth} m</dd>` : ""}
        ${smp ? `<dt>Landform</dt><dd>${LANDFORMS[smp.landform].name}</dd>` : ""}
      </dl>
      ${s.notes ? `<p>${esc(s.notes)}</p>` : ""}
      <div class="meta"><a href="#" data-inspect="${s.lat},${s.lon}">Inspect terrain & depth here</a></div>`;
  }
  L_.sites = L.layerGroup();
  let siteMarkers = new Map();
  function drawSites() {
    L_.sites.clearLayers(); siteMarkers = new Map();
    const canvas = L.canvas({ pane: "sites", padding: 0.3 });
    for (const s of allSites()) {
      if (!siteVisible(s)) continue;
      const m = L.circleMarker([s.lat, s.lon], {
        renderer: canvas, radius: TYPE_R[s.type] || 5, color: s.source === "curated" ? "#111" : s.source === "mapfeature" ? "#fff" : "#333",
        weight: s.source === "curated" ? 2 : 1.2, dashArray: s.periods && s.periods.length ? null : "2 2",
        fillColor: siteColor(s), fillOpacity: 0.95, bubblingMouseEvents: false,
      }).bindPopup(() => sitePopup(s), { maxWidth: 360 }).bindTooltip(s.name, { direction: "top", offset: [0, -6] });
      siteMarkers.set(s, m);
      L_.sites.addLayer(m);
    }
    renderSiteList();
    renderLayerList();
  }
  map.on("popupopen", (e) => {
    const a = e.popup.getElement().querySelector("[data-inspect]");
    if (a) a.addEventListener("click", (ev) => { ev.preventDefault(); const [la, lo] = a.dataset.inspect.split(",").map(Number); inspect(la, lo); });
  });

  function renderSiteList() {
    const q = $("#sSearch").value.trim().toLowerCase(), src = $("#sSource").value, type = $("#sType").value;
    const list = allSites().filter((s) => siteVisible(s) && (!src || s.source === src) && (!type || s.type === type) &&
      (!q || [s.name, s.name_uk, s.type, s.notes].join(" ").toLowerCase().includes(q)));
    $("#sCount").textContent = list.length;
    $("#siteList").innerHTML = list.slice(0, 400).map((s, i) => `
      <li data-i="${i}">
        <div class="title"><span>${esc(s.name)}</span><span class="dot" style="background:${siteColor(s)}"></span></div>
        <div class="meta">${esc(s.type || "site")} · ${esc(SOURCES[s.source] || s.source)}${s.acc ? ` · ±${s.acc} km` : ""}</div>
        <div class="body">${(s.periods || []).map((id) => esc(PBY[id].name)).join(", ") || "undated"}</div>
      </li>`).join("") + (list.length > 400 ? `<li class="meta">${list.length - 400} more — refine the search.</li>` : "");
    $$("#siteList li[data-i]").forEach((li) => li.addEventListener("click", () => {
      const s = list[+li.dataset.i];
      map.flyTo([s.lat, s.lon], Math.max(map.getZoom(), 13), { duration: 0.8 });
      map.once("moveend", () => { const m = siteMarkers.get(s); if (m) m.openPopup(); });
    }));
    const srcs = new Set(allSites().map((s) => s.source)), types = new Set(allSites().map((s) => s.type).filter(Boolean));
    const keep = (sel, opts, label) => { const cur = sel.value; sel.innerHTML = `<option value="">${label}</option>` + [...opts].sort().map((o) => `<option value="${esc(o)}" ${o === cur ? "selected" : ""}>${esc(SOURCES[o] || o)}</option>`).join(""); };
    keep($("#sSource"), srcs, "All sources"); keep($("#sType"), types, "All types");
  }
  ["#sSearch", "#sSource", "#sType"].forEach((s) => $(s).addEventListener("input", renderSiteList));

  /* ---- Import / export ---- */
  function parseCSV(text) {
    const rows = [];
    let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === "," || ch === ";" || ch === "\t") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    const head = rows.shift().map((h) => h.trim().toLowerCase());
    return rows.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
  }
  function normSite(p, lat, lon) {
    const g = (...k) => { for (const x of k) if (p[x] != null && p[x] !== "") return p[x]; return ""; };
    return {
      id: "imp_" + uid(), source: "imported", name: g("name", "назва", "title") || "Site",
      lat: +lat, lon: +lon, type: (g("type", "тип") || "").toLowerCase() || "site",
      periods: parsePeriods(g("period", "periods", "період", "dating", "date")),
      notes: g("notes", "description", "опис"), depth: +g("depth", "depth_top", "глибина") || null, acc: +g("acc") || null,
    };
  }
  $("#sImport").addEventListener("change", async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    const text = await f.text();
    let add = [];
    try {
      if (/\.csv$/i.test(f.name)) {
        add = parseCSV(text).map((r) => normSite(r, r.lat || r.latitude || r.y, r.lon || r.lng || r.longitude || r.x));
      } else {
        const gj = JSON.parse(text);
        add = (gj.features || []).filter((ft) => ft.geometry && ft.geometry.type === "Point")
          .map((ft) => normSite(ft.properties || {}, ft.geometry.coordinates[1], ft.geometry.coordinates[0]));
      }
    } catch (e) { alert("Could not read file: " + e.message); return; }
    add = add.filter((s) => isFinite(s.lat) && isFinite(s.lon) && Math.abs(s.lat) <= 90);
    imported = imported.concat(add); store.set("ar_imported", imported);
    alert(`Imported ${add.length} sites (${add.filter((s) => s.periods.length).length} dated, ${add.filter((s) => s.depth).length} with depth).`);
    drawSites(); refreshCalibration(); ev.target.value = "";
  });
  $("#sClearImp").addEventListener("click", () => { if (confirm(`Remove ${imported.length} imported sites?`)) { imported = []; store.set("ar_imported", imported); drawSites(); refreshCalibration(); } });
  $("#sExport").addEventListener("click", () => {
    const list = allSites().filter(siteVisible);
    download("archeo-sites.geojson", JSON.stringify({ type: "FeatureCollection", features: list.map((s) => ({
      type: "Feature", geometry: { type: "Point", coordinates: [s.lon, s.lat] },
      properties: { name: s.name, type: s.type, periods: (s.periods || []).join(";"), source: s.source, notes: s.notes || "", depth: s.depth || null, acc_km: s.acc || null },
    })) }, null, 1), "application/geo+json");
  });

  /* ---- Online sources ---- */
  const TAG_PERIOD = [[/palaeo|paleo/i, "upal"], [/mesolith/i, "meso"], [/neolith/i, "neo"], [/trypil|tripol|cucuteni|eneolith|chalco/i, "eneo"],
    [/bronze/i, "bronze"], [/scyth|cimmer|iron/i, "eiron"], [/greek|hellen|roman/i, "antiq"], [/sarmat/i, "sarm"], [/chernia|chernya/i, "chern"],
    [/slav/i, "eslav"], [/rus|kiev|kyiv/i, "rus"], [/horde|lithuan|medieval/i, "late_med"], [/cossack|sich/i, "cossack"]];
  function tagPeriods(t) {
    const out = new Set();
    const txt = [t["historic:period"], t["historic:civilization"], t["site_type"], t["description"], t.name].filter(Boolean).join(" ");
    TAG_PERIOD.forEach(([re, id]) => { if (re.test(txt)) out.add(id); });
    const sd = t.start_date && String(t.start_date).match(/^(-?\d{1,5})/);
    if (sd) periodsForYears(+sd[1], +sd[1]).forEach((x) => out.add(x));
    return [...out];
  }
  $("#osmLoad").addEventListener("click", async () => {
    const st = $("#srcStatus");
    if (map.getZoom() < 9) { st.textContent = "Zoom in to level 9 or closer first."; return; }
    const b = map.getBounds(), bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((v) => fmt(v, 4)).join(",");
    const q = `[out:json][timeout:90];nwr["historic"~"^(archaeological_site|tumulus|castle|fort|ruins|battlefield)$"](${bbox});out center tags;`;
    st.textContent = "Querying OpenStreetMap…";
    let data = null;
    for (const url of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
      try { const r = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q) }); if (r.ok) { data = await r.json(); break; } } catch (e) { /* next */ }
    }
    if (!data) { st.textContent = "Could not reach Overpass."; return; }
    const seen = new Set(online.map((s) => s.id));
    let n = 0;
    for (const el of data.elements || []) {
      const lat = el.lat || (el.center && el.center.lat), lon = el.lon || (el.center && el.center.lon);
      const id = "osm_" + el.type + el.id;
      if (!lat || seen.has(id)) continue;
      const t = el.tags || {};
      const kind = t.historic === "tumulus" || t.site_type === "tumulus" ? "barrow"
        : t.site_type === "fortification" || t.fortification_type ? "hillfort"
        : t.historic === "castle" || t.historic === "fort" ? "fortress" : t.historic === "battlefield" ? "battlefield"
        : t.site_type === "settlement" ? "settlement" : t.historic === "ruins" ? "ruins" : "site";
      online.push({ id, source: "osm", name: t["name:en"] || t.name || t["name:uk"] || `(${kind})`, lat, lon, type: kind, periods: tagPeriods(t),
        notes: [t.description, t["historic:civilization"], t.start_date && "start_date " + t.start_date].filter(Boolean).join(" · "),
        url: `https://www.openstreetmap.org/${el.type}/${el.id}` });
      n++;
    }
    st.textContent = `Added ${n} OSM sites.`; drawSites();
  });
  $("#wdLoad").addEventListener("click", async () => {
    const st = $("#srcStatus");
    st.textContent = "Querying Wikidata (can take ~30 s)…";
    const sparql = `SELECT ?item ?itemLabel ?coord ?inception ?typeLabel WHERE {
      ?item wdt:P31 ?type . ?type wdt:P279* wd:Q839954 . ?item wdt:P17 wd:Q212 ; wdt:P625 ?coord .
      OPTIONAL { ?item wdt:P571 ?inception }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "uk,en,ru". } } LIMIT 8000`;
    try {
      const r = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(sparql), { headers: { Accept: "application/sparql-results+json" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      const seen = new Set(online.map((s) => s.id));
      let n = 0;
      for (const b of j.results.bindings) {
        const id = "wd_" + b.item.value.split("/").pop();
        if (seen.has(id)) continue;
        const m = b.coord.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
        if (!m) continue;
        const tl = (b.typeLabel && b.typeLabel.value) || "";
        const type = /курган|tumul|barrow|могил/i.test(tl) ? "barrow" : /городищ|hillfort/i.test(tl) ? "hillfort" : /поселен|settlement/i.test(tl) ? "settlement" : "site";
        let periods = [];
        if (b.inception) { const y = parseInt(b.inception.value, 10); if (isFinite(y)) periods = periodsForYears(y, y); }
        online.push({ id, source: "wikidata", name: b.itemLabel.value, lat: +m[2], lon: +m[1], type, periods, notes: tl, url: b.item.value });
        seen.add(id); n++;
      }
      st.textContent = `Added ${n} Wikidata sites.`; drawSites();
    } catch (e) { st.textContent = "Wikidata query failed: " + e.message; }
  });

  /* ------------------------------------------------------------------ */
  /* Periods UI                                                          */
  /* ------------------------------------------------------------------ */
  function renderPeriods() {
    const counts = {};
    allSites().forEach((s) => (s.periods || []).forEach((p) => { counts[p] = (counts[p] || 0) + 1; }));
    $("#periodList").innerHTML = PERIODS.map((p) => `
      <label style="opacity:${p.idx >= pState.from && p.idx <= pState.to ? 1 : 0.4}" title="${esc(p.cultures)}">
        <input type="checkbox" data-p="${p.id}" ${pState.on.includes(p.id) ? "checked" : ""}>
        <span class="dot" style="background:${p.color}"></span>${esc(p.name)}
        <span class="yrs">${counts[p.id] || 0} · ${yearStr(p.from)}–${yearStr(p.to)}</span></label>`).join("");
    const a = PERIODS[pState.from], b = PERIODS[pState.to];
    $("#rangeLabel").textContent = `${a.name} → ${b.name}  (${yearStr(a.from)} – ${yearStr(b.to)})`;
    const n = PERIODS.length - 1;
    $("#rangeFill").style.left = (pState.from / n) * 100 + "%";
    $("#rangeFill").style.width = ((pState.to - pState.from) / n) * 100 + "%";
    $("#pCount").textContent = PERIODS.filter((p) => periodActive(p.id)).length + " shown";
    $("#pFrom").value = pState.from; $("#pTo").value = pState.to; $("#pUndated").checked = pState.undated;
  }
  function periodsChanged() {
    store.set("ar_periods", pState); renderPeriods(); drawSites();
    if (typeof CATALOG !== "undefined" && $("#catWindow").checked) CATALOG.forEach(catRefresh);
  }
  $("#periodList").addEventListener("change", (e) => {
    const id = e.target.dataset.p; if (!id) return;
    pState.on = e.target.checked ? pState.on.concat(id) : pState.on.filter((x) => x !== id);
    periodsChanged();
  });
  $("#pFrom").addEventListener("input", (e) => { pState.from = Math.min(+e.target.value, pState.to); periodsChanged(); });
  $("#pTo").addEventListener("input", (e) => { pState.to = Math.max(+e.target.value, pState.from); periodsChanged(); });
  $("#pAll").addEventListener("click", () => { pState.on = PERIODS.map((p) => p.id); pState.from = 0; pState.to = PERIODS.length - 1; periodsChanged(); });
  $("#pNone").addEventListener("click", () => { pState.on = []; periodsChanged(); });
  $("#pUndated").addEventListener("change", (e) => { pState.undated = e.target.checked; periodsChanged(); });

  /* ------------------------------------------------------------------ */
  /* Layer list                                                          */
  /* ------------------------------------------------------------------ */
  const LAYER_DEFS = [
    { key: "sites", label: "Archaeological sites", swatch: "#d7a86e", round: true, on: true },
    { key: "pot_settlement", label: "Settlement potential", swatch: "rgb(60,190,90)", on: false },
    { key: "pot_barrow", label: "Barrow potential", swatch: "rgb(230,90,40)", on: false },
    { key: "pot_hillfort", label: "Hillfort potential", swatch: "rgb(170,90,230)", on: false },
    { key: "landform", label: "Landforms (depth model input)", swatch: "linear-gradient(90deg,#4fc3f7,#aed581,#ffb74d,#e57373,#fff176)", on: false },
    { key: "streams", label: "Streams (DEM)", swatch: "#4fa3d9", on: true },
    { key: "relief", label: "Shaded relief", swatch: "linear-gradient(135deg,#fff,#555)", on: true },
    { key: "hist", label: "Historical maps", swatch: "#b08d57", on: true },
    { key: "survey", label: "Survey candidates", swatch: "#ffd54f", round: true, on: true },
    { key: "voids", label: "Promising terrain (voids)", swatch: "rgb(186,104,200)", on: true },
    { key: "shapes", label: "Detected circles & rectangles", swatch: "transparent", round: true, on: true },
    { key: "log", label: "Field log", swatch: "#29b6f6", on: true },
    { key: "studyAreas", label: "30 m study areas", swatch: "transparent", on: true },
    { key: "zones", label: "Landscape zones", swatch: "#9c8a3c", on: false },
    { key: "admin", label: "Border & oblasts", swatch: "#c9c3b5", on: true },
    { key: "places", label: "Cities", swatch: "#e8e6e1", round: true, on: true },
  ];
  const layerState = store.get("ar_layers", {});
  const isOn = (d) => (layerState[d.key] != null ? layerState[d.key] : d.on);
  function renderLayerList() {
    $("#layerList").innerHTML = LAYER_DEFS.map((d) => `<label><input type="checkbox" data-layer="${d.key}" ${isOn(d) ? "checked" : ""}>
      <span class="swatch ${d.round ? "round" : ""}" style="background:${d.swatch}"></span>${esc(d.label)}
      ${d.key === "sites" ? `<span class="count">${L_.sites.getLayers().length}</span>` : ""}</label>`).join("");
  }
  function applyLayers() {
    LAYER_DEFS.forEach((d) => {
      const lay = L_[d.key]; if (!lay) return;
      if (isOn(d) && !map.hasLayer(lay)) lay.addTo(map);
      if (!isOn(d) && map.hasLayer(lay)) map.removeLayer(lay);
    });
    syncPotButtons();
  }
  // Quick potential toggles on the map
  const PotControl = L.Control.extend({
    options: { position: "topleft" },
    onAdd() {
      const div = L.DomUtil.create("div", "leaflet-bar pot-ctl");
      div.innerHTML = POT.map((p) => `<a href="#" data-pk="${p.key}" title="${p.label}" style="--c:rgb(${p.rgb})">${p.label[0]}</a>`).join("");
      L.DomEvent.disableClickPropagation(div);
      div.querySelectorAll("a").forEach((a) => a.addEventListener("click", (e) => {
        e.preventDefault();
        const d = LAYER_DEFS.find((x) => x.key === a.dataset.pk);
        layerState[d.key] = !isOn(d); store.set("ar_layers", layerState); applyLayers(); renderLayerList();
      }));
      return div;
    },
  });
  new PotControl().addTo(map);
  function syncPotButtons() {
    document.querySelectorAll(".pot-ctl a").forEach((a) => a.classList.toggle("on", isOn(LAYER_DEFS.find((x) => x.key === a.dataset.pk))));
  }
  $("#layerList").addEventListener("change", (e) => { const k = e.target.dataset.layer; if (!k) return; layerState[k] = e.target.checked; store.set("ar_layers", layerState); applyLayers(); });
  $("#op").value = overlayOpacity; $("#opOut").textContent = fmt(overlayOpacity);
  $("#potMin").value = potMin; $("#potMinOut").textContent = fmt(potMin);
  const rebuildPot = debounce(() => { if (rasters.length) buildPotentials(); }, 250);
  $("#potMin").addEventListener("input", (e) => { potMin = +e.target.value; $("#potMinOut").textContent = fmt(potMin); store.set("ar_potmin", potMin); rebuildPot(); });
  $("#op").addEventListener("input", (e) => {
    overlayOpacity = +e.target.value; $("#opOut").textContent = fmt(overlayOpacity); store.set("ar_op", overlayOpacity);
    ["pot_barrow", "pot_settlement", "pot_hillfort", "landform"].forEach((k) => L_[k].eachLayer((l) => l.setOpacity(overlayOpacity)));
  });
  $("#potRamp").style.background = "linear-gradient(90deg, rgba(60,190,90,.15), rgba(60,190,90,1))";
  $("#lfLegend").innerHTML = LANDFORMS.filter((l) => l.id).map((l) => `<span><i class="dot" style="background:${l.color}"></i>${l.name}</span>`).join("");

  /* ------------------------------------------------------------------ */
  /* Depth calibration                                                   */
  /* ------------------------------------------------------------------ */
  let calib = () => ({ factor: 1, n: 0 });
  function refreshCalibration() {
    if (!rasters.length) return;
    const obs = [];
    log.filter((r) => r.kind === "observation" && r.depthTop > 0 && r.periodId).forEach((r) => obs.push({ lat: r.lat, lon: r.lon, periodId: r.periodId, depthTop: +r.depthTop, lf: r.lf }));
    imported.filter((s) => s.depth > 0 && s.periods.length).forEach((s) => { const sm = sampleAt(s.lat, s.lon); obs.push({ lat: s.lat, lon: s.lon, periodId: s.periods[0], depthTop: s.depth, lf: sm ? sm.landform : null }); });
    calib = calibrator(obs, PBY, zoneAt, distKm);
    calib.count = obs.length;
  }
  function depthFor(lat, lon, lf, p, type) {
    const e = estimate(lf, p, zoneAt(lat, lon), type);
    if (!e.top) return e;
    const c = calib(lat, lon, lf);
    if (c.n) {
      e.top = e.top.map((v) => Math.round(v * c.factor * 100) / 100);
      e.base = e.base.map((v) => Math.round(v * c.factor * 100) / 100);
      e.calibrated = c;
    }
    return e;
  }
  const rng = (r) => (r ? (r[0] === r[1] ? `${fmt(r[0])} m` : `${fmt(r[0])}–${fmt(r[1])} m`) : "—");

  /* ------------------------------------------------------------------ */
  /* Inspector                                                           */
  /* ------------------------------------------------------------------ */
  let inspectMarker = null;
  function potBar(label, v, rgb) {
    return `<div style="display:flex;align-items:center;gap:8px;font-size:12.5px"><span style="width:80px">${label}</span>
      <div class="bar" style="flex:1;margin:0"><i style="width:${Math.round(v * 100)}%;background:rgb(${rgb})"></i></div><span class="score">${fmt(v)}</span></div>`;
  }
  function inspect(lat, lon) {
    const smp = sampleAt(lat, lon), zone = zoneAt(lat, lon);
    const vis = PERIODS.filter((p) => periodActive(p.id));
    const plist = vis.length ? vis : PERIODS;
    const near = allSites().map((s) => ({ s, d: distKm(lat, lon, s.lat, s.lon) })).sort((a, b) => a.d - b.d).slice(0, 6);
    let html = `<div class="meta">${ll(lat, lon)}${zone ? ` · ${esc(zone.name)}` : ""}${smp ? ` · ${smp.res_m} m grid (${esc(smp.raster)})` : ""}</div>`;
    if (!smp) html += `<p class="hint">No terrain raster here.</p>`;
    else {
      const lf = LANDFORMS[smp.landform];
      html += `<h3>Terrain</h3><dl class="kv">
        <dt>Landform</dt><dd><span class="dot" style="background:${lf.color}"></span> ${lf.name}</dd>
        <dt>Elevation</dt><dd>~${smp.elev} m</dd>
        <dt>Above stream (HAND)</dt><dd>${smp.hand} m</dd>
        <dt>Slope</dt><dd>${fmt(smp.slope, 1)}°</dd>
        <dt>To nearest stream</dt><dd>${smp.dist >= 25500 ? "> 25 km" : (smp.dist / 1000).toFixed(1) + " km"}</dd>
        <dt>Position (5 km)</dt><dd>${smp.tpi5 > 0 ? "+" : ""}${smp.tpi5} m ${smp.tpi5 > 8 ? "(high ground)" : smp.tpi5 < -8 ? "(low ground)" : ""}</dd></dl>
        <h3>Site potential</h3>
        ${potBar("Settlement", smp.settlement, "60,190,90")}${potBar("Barrow", smp.barrow, "230,90,40")}${potBar("Hillfort", smp.hillfort, "170,90,230")}
        <h3>Expected depth to cultural layer</h3>
        <table class="simple depth"><tr><th>Period</th><th>Top</th><th>Base</th></tr>
        ${plist.map((p) => { const e = depthFor(lat, lon, smp.landform, p, smp.barrow > 0.5 && smp.barrow > smp.settlement ? "barrow" : "settlement");
          return `<tr><td><span class="dot" style="background:${p.color}"></span> ${esc(p.name)}</td><td>${rng(e.top)}${e.surface ? " ⚑" : ""}</td><td>${rng(e.base)}</td></tr>`; }).join("")}
        </table>
        <p class="report-note">⚑ within the plough zone: expect surface material. ${(() => { const c = calib(lat, lon, smp.landform); return c.n ? `Calibrated by ${c.n} nearby observation(s), factor ×${fmt(c.factor)}.` : "Not calibrated: add depth observations in the Field log to calibrate."; })()}</p>
        <p class="report-note">${esc(lf.note)}</p>`;
    }
    html += `<h3>Nearest sites</h3><ul class="cards">${near.map(({ s, d }) => `<li data-lat="${s.lat}" data-lon="${s.lon}"><div class="title"><span>${esc(s.name)}</span><span class="meta">${fmt(d, 1)} km</span></div>
      <div class="meta">${(s.periods || []).map((id) => PBY[id].name).join(", ") || "undated"}</div></li>`).join("")}</ul>
      <div class="row"><button class="btn primary" id="inAddObs">Record observation here</button>
        <button class="btn" id="inScan" title="Look for circles and rectangles in satellite imagery around this point">Scan imagery here</button></div>
      <div id="inScanOut" class="status"></div>`;
    $("#inspectOut").innerHTML = html;
    $$("#inspectOut li[data-lat]").forEach((li) => li.addEventListener("click", () => map.flyTo([+li.dataset.lat, +li.dataset.lon], Math.max(map.getZoom(), 13))));
    $("#inAddObs").addEventListener("click", () => addLog(lat, lon, "observation"));
    $("#inScan").addEventListener("click", async () => {
      $("#inScanOut").textContent = "Scanning imagery…";
      const n = await scanAt(lat, lon);
      $("#inScanOut").textContent = n < 0 ? scanError : `${n} shape(s) found. See Promising → Detections.`;
    });
    if (inspectMarker) inspectMarker.remove();
    inspectMarker = L.circleMarker([lat, lon], { pane: "log", radius: 8, color: "#fff", weight: 2, fill: false, interactive: false }).addTo(map);
    showTab("inspect");
  }

  /* ------------------------------------------------------------------ */
  /* Survey planning                                                     */
  /* ------------------------------------------------------------------ */
  L_.survey = L.layerGroup();
  let candidates = [];
  const bindOut = (id, out, f) => { const el = $("#" + id); const u = () => { $("#" + out).textContent = f(+el.value); }; el.addEventListener("input", u); u(); };
  bindOut("svMin", "svMinOut", (v) => fmt(v));
  bindOut("svSp", "svSpOut", (v) => fmt(v, 1) + " km");
  $("#svRun").addEventListener("click", () => {
    if (!rasters.length) return;
    const band = +$("#svType").value, b = map.getBounds(), c = map.getCenter();
    const r = rasterAt(c.lat, c.lng);
    if (!r) { $("#svStatus").textContent = "No raster under the map centre."; return; }
    const bbox = { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() };
    const cells = ((bbox.n - bbox.s) / r.dy) * ((bbox.e - bbox.w) / r.dx);
    if (cells > 4e6) { $("#svStatus").textContent = "View too large for this grid — zoom in."; return; }
    let pk = peaks(r, band, bbox, +$("#svMin").value, Math.max(+$("#svSp").value, r.res_m / 1000), distKm);
    if ($("#svNovel").checked) { const known = allSites(); pk = pk.filter((p) => !known.some((s) => distKm(p.lat, p.lon, s.lat, s.lon) < 0.5)); }
    const typeName = ["barrow", "settlement", "hillfort"][band];
    candidates = pk.slice(0, 300).map((p, i) => { const smp = r.sample(p.lat, p.lon); return Object.assign(p, { rank: i + 1, type: typeName, smp }); });
    L_.survey.clearLayers();
    candidates.forEach((p) => L_.survey.addLayer(L.marker([p.lat, p.lon], { pane: "survey",
      icon: L.divIcon({ className: "target-icon", html: String(p.rank), iconSize: [20, 20] }), title: `#${p.rank} ${typeName} ${fmt(p.v)}` })
      .bindPopup(`<h4>#${p.rank} · ${typeName} candidate</h4><div class="big-score">${fmt(p.v)}</div>
        <dl class="kv"><dt>Landform</dt><dd>${LANDFORMS[p.smp.landform].name}</dd><dt>Above stream</dt><dd>${p.smp.hand} m</dd>
        <dt>To stream</dt><dd>${(p.smp.dist / 1000).toFixed(1)} km</dd><dt>Slope</dt><dd>${fmt(p.smp.slope, 1)}°</dd><dt>Position</dt><dd>${ll(p.lat, p.lon)}</dd></dl>
        <div class="meta"><a href="#" data-inspect="${p.lat},${p.lon}">Inspect & depth</a></div>`)));
    $("#svStatus").textContent = `${candidates.length} candidates from the ${r.res_m} m grid (${r.name}).`;
    $("#svList").innerHTML = candidates.slice(0, 150).map((p) => `<li data-i="${p.rank - 1}"><div class="title"><span>${typeName} candidate</span><span class="score">${fmt(p.v)}</span></div>
      <div class="meta">${LANDFORMS[p.smp.landform].name} · ${p.smp.hand} m above stream · ${ll(p.lat, p.lon)}</div></li>`).join("");
    $$("#svList li").forEach((li) => li.addEventListener("click", () => { const p = candidates[+li.dataset.i]; map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), 14)); }));
    if (!isOn({ key: "survey", on: true })) { layerState.survey = true; applyLayers(); renderLayerList(); }
  });
  $$("[data-svexport]").forEach((b) => b.addEventListener("click", () => {
    if (!candidates.length) return;
    const k = b.dataset.svexport;
    if (k === "gpx") download("survey-candidates.gpx", `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Archeo UA" xmlns="http://www.topografix.com/GPX/1/1">\n${candidates.map((p) =>
      `  <wpt lat="${fmt(p.lat, 6)}" lon="${fmt(p.lon, 6)}"><name>${p.type} #${p.rank}</name><desc>potential ${fmt(p.v)}; ${LANDFORMS[p.smp.landform].name}; HAND ${p.smp.hand} m</desc></wpt>`).join("\n")}\n</gpx>\n`, "application/gpx+xml");
    else if (k === "geojson") download("survey-candidates.geojson", JSON.stringify({ type: "FeatureCollection", features: candidates.map((p) => ({ type: "Feature",
      geometry: { type: "Point", coordinates: [+fmt(p.lon, 6), +fmt(p.lat, 6)] }, properties: { rank: p.rank, type: p.type, potential: +fmt(p.v, 3), landform: LANDFORMS[p.smp.landform].key, hand_m: p.smp.hand, slope_deg: p.smp.slope, stream_m: p.smp.dist } })) }, null, 1), "application/geo+json");
    else download("survey-candidates.csv", "rank,lat,lon,type,potential,landform,hand_m,slope_deg,stream_m\n" + candidates.map((p) =>
      [p.rank, fmt(p.lat, 6), fmt(p.lon, 6), p.type, fmt(p.v, 3), LANDFORMS[p.smp.landform].key, p.smp.hand, p.smp.slope, p.smp.dist].join(",")).join("\n"), "text/csv");
  }));

  /* ------------------------------------------------------------------ */
  /* Desk-based assessment                                               */
  /* ------------------------------------------------------------------ */
  let drawing = null, area = null, areaLayer = null;
  bindOut("dbBuf", "dbBufOut", (v) => fmt(v, 1) + " km");
  function startDraw() {
    mode = "dbdraw"; drawing = []; map.doubleClickZoom.disable();
    document.body.classList.add("picking"); $("#dbOut").innerHTML = `<p class="hint">Click vertices on the map; double-click to finish.</p>`;
    if (areaLayer) areaLayer.remove();
    areaLayer = L.polyline([], { pane: "draw", color: "#ffd54f", weight: 2, dashArray: "5 4" }).addTo(map);
  }
  function finishDraw() {
    mode = null; map.doubleClickZoom.enable(); document.body.classList.remove("picking");
    if (!drawing || drawing.length < 3) { $("#dbOut").innerHTML = `<p class="hint">Need at least 3 vertices.</p>`; return; }
    area = drawing.slice(); drawing = null;
    areaLayer.remove();
    areaLayer = L.polygon(area, { pane: "draw", color: "#ffd54f", weight: 2, fillOpacity: 0.08 }).addTo(map);
    assess();
  }
  function assess() {
    if (!area) return;
    const buf = +$("#dbBuf").value;
    const lat0 = area.reduce((s, p) => s + p[0], 0) / area.length, lon0 = area.reduce((s, p) => s + p[1], 0) / area.length;
    const kx = 111.32 * Math.cos(lat0 * Math.PI / 180);
    let a2 = 0;
    for (let i = 0, j = area.length - 1; i < area.length; j = i++) a2 += (area[j][1] * kx) * (area[i][0] * 110.57) - (area[i][1] * kx) * (area[j][0] * 110.57);
    const areaKm2 = Math.abs(a2) / 2;
    const inside = (lat, lon) => pointInRing(lat, lon, area);
    const edgeDist = (lat, lon) => Math.min(...area.map((p, i) => distToSegKm(lat, lon, p, area[(i + 1) % area.length])));
    const sites = allSites().map((s) => ({ s, inside: inside(s.lat, s.lon), d: inside(s.lat, s.lon) ? 0 : edgeDist(s.lat, s.lon) }))
      .filter((x) => x.d <= buf).sort((a, b) => a.d - b.d);
    // raster statistics
    const r = rasterAt(lat0, lon0);
    const st = { n: 0, lf: new Array(7).fill(0), pot: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], max: [0, 0, 0], elev: [1e9, -1e9] };
    if (r) {
      const s_ = Math.min(...area.map((p) => p[0])), n_ = Math.max(...area.map((p) => p[0])), w_ = Math.min(...area.map((p) => p[1])), e_ = Math.max(...area.map((p) => p[1]));
      const step = Math.max(1, Math.round(Math.sqrt(((n_ - s_) / r.dy) * ((e_ - w_) / r.dx) / 200000)));
      for (let lat = n_ - r.dy / 2; lat > s_; lat -= r.dy * step) {
        for (let lon = w_ + r.dx / 2; lon < e_; lon += r.dx * step) {
          if (!inside(lat, lon)) continue;
          const sm = r.sample(lat, lon); if (!sm) continue;
          st.n++; st.lf[sm.landform]++;
          [sm.barrow, sm.settlement, sm.hillfort].forEach((v, k) => { if (v >= 0.25) st.pot[k][0]++; if (v >= 0.5) st.pot[k][1]++; if (v >= 0.75) st.pot[k][2]++; st.max[k] = Math.max(st.max[k], v); });
          st.elev[0] = Math.min(st.elev[0], sm.elev); st.elev[1] = Math.max(st.elev[1], sm.elev);
        }
      }
    }
    area.stats = { areaKm2, buf, lat0, lon0, sites, st, r };
    const pct = (x) => (st.n ? Math.round((x / st.n) * 100) : 0) + "%";
    const vis = PERIODS.filter((p) => periodActive(p.id));
    const lfPresent = LANDFORMS.filter((l) => l.id && st.lf[l.id] / Math.max(st.n, 1) >= 0.05);
    $("#dbOut").innerHTML = `
      <h3>Summary</h3><dl class="kv"><dt>Area</dt><dd>${fmt(areaKm2, 2)} km²</dd><dt>Centroid</dt><dd>${ll(lat0, lon0)}</dd>
      <dt>Elevation</dt><dd>${st.n ? `${st.elev[0]}–${st.elev[1]} m` : "—"}</dd><dt>Grid</dt><dd>${r ? r.res_m + " m (" + esc(r.name) + ")" : "none"}</dd></dl>
      <h3>Known sites (in area + ${fmt(buf, 1)} km) <span class="pill">${sites.length}</span></h3>
      <ul class="cards">${sites.slice(0, 50).map(({ s, inside: ins, d }) => `<li><div class="title"><span>${esc(s.name)}</span><span class="meta">${ins ? "inside" : fmt(d, 2) + " km"}</span></div>
        <div class="meta">${esc(s.type || "")} · ${(s.periods || []).map((id) => PBY[id].name).join(", ") || "undated"} · ${esc(SOURCES[s.source] || s.source)}</div></li>`).join("") || `<li class="meta">None recorded in the loaded data.</li>`}</ul>
      <h3>Predicted potential (share of area)</h3>
      <table class="simple"><tr><th></th><th>≥0.25</th><th>≥0.5</th><th>≥0.75</th><th>max</th></tr>
      ${["Barrow", "Settlement", "Hillfort"].map((n, k) => `<tr><td>${n}</td><td>${pct(st.pot[k][0])}</td><td>${pct(st.pot[k][1])}</td><td>${pct(st.pot[k][2])}</td><td>${fmt(st.max[k])}</td></tr>`).join("")}</table>
      <h3>Landforms</h3><table class="simple">${LANDFORMS.filter((l) => l.id && st.lf[l.id]).map((l) => `<tr><td><span class="dot" style="background:${l.color}"></span> ${l.name}</td><td>${pct(st.lf[l.id])}</td></tr>`).join("")}</table>
      <h3>Expected depths (by landform)</h3>
      <table class="simple depth"><tr><th>Period</th>${lfPresent.map((l) => `<th>${l.name}</th>`).join("")}</tr>
      ${(vis.length ? vis : PERIODS).map((p) => `<tr><td>${esc(p.name)}</td>${lfPresent.map((l) => { const e = depthFor(lat0, lon0, l.id, p); return `<td>${rng(e.top)}</td>`; }).join("")}</tr>`).join("")}</table>
      <p class="report-note">Depths to the top of the cultural layer.</p>`;
  }
  $("#dbDraw").addEventListener("click", startDraw);
  $("#dbClear").addEventListener("click", () => { area = null; if (areaLayer) areaLayer.remove(); areaLayer = null; $("#dbOut").innerHTML = ""; });
  $("#dbBuf").addEventListener("change", assess);
  $("#dbReport").addEventListener("click", () => {
    if (!area || !area.stats) { alert("Draw an area first."); return; }
    const w = window.open("", "_blank");
    if (!w) { alert("Allow pop-ups to open the report."); return; }
    const S = area.stats;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Desk-based assessment</title>
      <style>body{font:14px/1.5 system-ui,sans-serif;max-width:900px;margin:30px auto;padding:0 20px;color:#222}h1{font-size:22px}h2{font-size:16px;margin-top:24px;border-bottom:1px solid #ccc}
      table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left;vertical-align:top}.dot{display:inline-block;width:10px;height:10px;border-radius:50%}
      .tag,.pill{font-size:11px}.meta,.report-note{color:#666;font-size:12px}ul.cards{list-style:none;padding:0}ul.cards li{border-bottom:1px solid #eee;padding:4px 0}dl.kv{display:grid;grid-template-columns:140px 1fr;gap:2px 10px}dd{margin:0}
      .title{display:flex;justify-content:space-between}</style></head><body>
      <h1>Desk-based archaeological assessment</h1>
      <p class="meta">Generated ${new Date().toLocaleString()} with Archeo UA. Area polygon: ${area.map((p) => ll(p[0], p[1])).join("; ")}</p>
      ${$("#dbOut").innerHTML}
      <h2>Method and limitations</h2>
      <p>Known sites come from the datasets loaded in the application (${[...new Set(allSites().map((s) => SOURCES[s.source] || s.source))].join(", ")}). Absence of recorded sites is not evidence of absence.</p>
      <p>Site potential is a rule-based terrain model (Copernicus GLO-30 DEM, ${S.r ? S.r.res_m + " m grid" : "no grid"}): settlements favour dry ground 2–15 m above and within ~0.5 km of streams; barrows favour watershed ridges and plateau edges; hillforts favour promontories with steep sides near rivers. It is uncalibrated against a site register unless stated.</p>
      <p>Depths are estimates from period age × landform burial rates, ${calib.count ? "calibrated with " + calib.count + " recorded observation(s)" : "not calibrated with local observations"}. Field evaluation (test pits, augering, geophysics) is required.</p>
      </body></html>`);
    w.document.close();
  });

  /* ------------------------------------------------------------------ */
  /* Field log                                                           */
  /* ------------------------------------------------------------------ */
  let log = store.get("ar_log", []);
  L_.log = L.layerGroup();
  function saveLog() { store.set("ar_log", log); refreshCalibration(); drawLog(); }
  function addLog(lat, lon, kind) {
    const sm = sampleAt(lat, lon);
    log.unshift({ id: uid(), lat: +fmt(lat, 6), lon: +fmt(lon, 6), date: new Date().toISOString().slice(0, 10), kind: kind || "find",
      periodId: "", depthTop: "", depthBase: "", notes: "", lf: sm ? sm.landform : null });
    saveLog(); showTab("log");
  }
  function drawLog() {
    L_.log.clearLayers();
    log.forEach((e) => L_.log.addLayer(L.marker([e.lat, e.lon], { pane: "log", icon: L.divIcon({ className: "log-icon", iconSize: [12, 12] }) })
      .bindPopup(`<h4>${esc(e.kind)} · ${esc(e.date)}</h4><div>${e.periodId ? esc(PBY[e.periodId].name) : "undated"}</div>${e.depthTop ? `<div>Depth ${e.depthTop}${e.depthBase ? "–" + e.depthBase : ""} m</div>` : ""}<div>${esc(e.notes)}</div>`)));
    const popts = (sel) => `<option value="">Period…</option>` + PERIODS.map((p) => `<option value="${p.id}" ${p.id === sel ? "selected" : ""}>${esc(p.name)}</option>`).join("");
    $("#logList").innerHTML = log.map((e, i) => `<li data-i="${i}">
      <div class="title"><span>${esc(e.kind)} · ${ll(e.lat, e.lon)}</span><button class="btn" data-del="${i}">✕</button></div>
      <div class="meta">${e.lf != null ? LANDFORMS[e.lf].name : ""}</div>
      <div class="filters" style="margin-top:6px">
        <select data-f="kind"><option value="find" ${e.kind === "find" ? "selected" : ""}>Find / feature</option><option value="observation" ${e.kind === "observation" ? "selected" : ""}>Depth observation (calibrates)</option></select>
        <input type="date" data-f="date" value="${esc(e.date)}">
        <select data-f="periodId">${popts(e.periodId)}</select>
        <div class="row" style="margin:0"><input type="number" step="0.05" data-f="depthTop" value="${esc(e.depthTop)}" placeholder="Top of layer (m)"><input type="number" step="0.05" data-f="depthBase" value="${esc(e.depthBase)}" placeholder="Base (m)"></div>
        <textarea data-f="notes" placeholder="Context, finds, soil, method (test pit, auger, section)…">${esc(e.notes)}</textarea>
      </div></li>`).join("") || `<li class="meta">No records yet.</li>`;
    $$("#logList [data-f]").forEach((inp) => inp.addEventListener("change", () => { log[+inp.closest("li").dataset.i][inp.dataset.f] = inp.value; saveLog(); }));
    $$("#logList [data-del]").forEach((b) => b.addEventListener("click", () => { log.splice(+b.dataset.del, 1); saveLog(); }));
  }
  $("#logAdd").addEventListener("click", () => { mode = "log"; document.body.classList.add("picking"); $("#logAdd").textContent = "Click the map…"; });
  const logFeatures = () => log.map((e) => ({ type: "Feature", geometry: { type: "Point", coordinates: [e.lon, e.lat] },
    properties: { kind: e.kind, date: e.date, period: e.periodId, depth_top: e.depthTop, depth_base: e.depthBase, notes: e.notes, landform: e.lf != null ? LANDFORMS[e.lf].key : null } }));
  $("#logExport").addEventListener("click", () => download("archeo-fieldlog.geojson", JSON.stringify({ type: "FeatureCollection", features: logFeatures() }, null, 1), "application/geo+json"));
  $("#logCsv").addEventListener("click", () => download("archeo-fieldlog.csv", "kind,date,lat,lon,period,depth_top,depth_base,landform,notes\n" +
    log.map((e) => [e.kind, e.date, e.lat, e.lon, e.periodId, e.depthTop, e.depthBase, e.lf != null ? LANDFORMS[e.lf].key : "", `"${String(e.notes).replace(/"/g, '""')}"`].join(",")).join("\n"), "text/csv"));
  $("#logImport").addEventListener("change", async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    try {
      const gj = JSON.parse(await f.text());
      (gj.features || []).forEach((ft) => { const p = ft.properties || {}; const [lon, lat] = ft.geometry.coordinates; const sm = sampleAt(lat, lon);
        log.push({ id: uid(), lat, lon, kind: p.kind || "find", date: p.date || "", periodId: PBY[p.period] ? p.period : "", depthTop: p.depth_top || "", depthBase: p.depth_base || "", notes: p.notes || "", lf: sm ? sm.landform : null }); });
      saveLog();
    } catch (e) { alert("Could not read file: " + e.message); }
  });

  /* ------------------------------------------------------------------ */
  /* Historical maps                                                     */
  /* ------------------------------------------------------------------ */
  L_.histUser = L.layerGroup();
  L_.histCat = L.layerGroup();
  L_.hist = L.layerGroup([L_.histUser, L_.histCat]);
  let histOnline = store.get("ar_hist", []);
  let scans = [];
  const histLayers = new Map();
  const swipe = new H.Swipe(map, "hist");
  function histLayerFor(h) {
    if (histLayers.has(h.id)) return histLayers.get(h.id);
    let l;
    if (h.kind === "scan") l = new H.AffineImage(h.url, h.M, { pane: "hist", opacity: h.opacity });
    else if (h.layers) l = L.tileLayer.wms(h.url, { layers: h.layers, format: "image/png", transparent: true, pane: "hist", opacity: h.opacity });
    else l = L.tileLayer(h.url, { pane: "hist", opacity: h.opacity, maxZoom: 19, attribution: h.name,
      minNativeZoom: h.minzoom || 0, maxNativeZoom: h.maxzoom || 19, bounds: h.bounds ? [[h.bounds[1], h.bounds[0]], [h.bounds[3], h.bounds[2]]] : undefined });
    histLayers.set(h.id, l);
    return l;
  }
  function renderHist() {
    const all = histOnline.concat(scans);
    L_.histUser.clearLayers();
    all.forEach((h) => { if (h.on !== false) L_.histUser.addLayer(histLayerFor(h)); });
    $("#histList").innerHTML = all.map((h) => `<li data-id="${h.id}"><div class="title"><label class="chk"><input type="checkbox" data-hon ${h.on !== false ? "checked" : ""}> ${esc(h.name)}${h.year ? " (" + h.year + ")" : ""}</label>
      <button class="btn" data-hdel title="Remove">✕</button></div>
      <div class="meta">${h.kind === "scan" ? `Georeferenced scan · ${h.gcps.length} points · RMS ~${Math.round(h.rmsM)} m` : h.layers ? "WMS" : "Tiles"}</div>
      <input type="range" min="0" max="1" step="0.05" value="${h.opacity}" data-hop style="width:100%;accent-color:var(--gold)"></li>`).join("") || `<li class="meta">No historical maps added yet.</li>`;
    $$("#histList li[data-id]").forEach((li) => {
      const h = all.find((x) => x.id === li.dataset.id);
      li.querySelector("[data-hon]").addEventListener("change", (e) => { h.on = e.target.checked; persistHist(h); renderHist(); });
      li.querySelector("[data-hop]").addEventListener("input", (e) => { h.opacity = +e.target.value; histLayerFor(h).setOpacity(h.opacity); persistHist(h); });
      li.querySelector("[data-hdel]").addEventListener("click", async () => {
        if (!confirm(`Remove "${h.name}"?`)) return;
        L_.histUser.removeLayer(histLayerFor(h)); histLayers.delete(h.id);
        if (h.kind === "scan") { await H.idbDel(h.id); scans = scans.filter((x) => x !== h); }
        else { histOnline = histOnline.filter((x) => x !== h); store.set("ar_hist", histOnline); }
        renderHist();
      });
    });
  }
  const persistHist = debounce((h) => {
    if (h.kind === "scan") H.idbPut({ id: h.id, name: h.name, year: h.year, blob: h.blob, M: h.M, gcps: h.gcps, rmsM: h.rmsM, opacity: h.opacity, on: h.on });
    else store.set("ar_hist", histOnline);
  }, 300);
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  $("#hAdd").addEventListener("click", async () => {
    let url = $("#hUrl").value.trim();
    if (!url) return;
    let tj = null;
    if (/tiles\.json|tilejson/i.test(url)) {
      // TileJSON: read the tile template, zoom range and bounds from it
      try { tj = await (await fetch(url)).json(); } catch (e) { alert("Could not read the TileJSON: " + e.message); return; }
      url = tj.tiles && tj.tiles[0];
      if (!url) { alert("No tile URL in this TileJSON."); return; }
      if (!$("#hName").value.trim() && tj.name) $("#hName").value = tj.name;
    }
    if (!$("#hLayers").value.trim() && !/\{z\}/.test(url)) { alert("Tile URLs need {z}, {x} and {y} placeholders; for WMS fill in the layers field."); return; }
    histOnline.push({ id: "h_" + uid(), kind: "online", name: $("#hName").value.trim() || "Historical map", url, layers: $("#hLayers").value.trim(), year: +$("#hYear").value || null, opacity: 0.8, on: true,
      minzoom: tj ? tj.minzoom : null, maxzoom: tj ? tj.maxzoom : null, bounds: tj ? tj.bounds : null });
    store.set("ar_hist", histOnline); renderHist();
    ["#hName", "#hUrl", "#hLayers", "#hYear"].forEach((s) => { $(s).value = ""; });
  });
  $("#swipeBtn").addEventListener("click", () => { swipe.set(!swipe.on); $("#swipeBtn").classList.toggle("active", swipe.on); });
  H.idbAll().then((list) => {
    scans = list.map((s) => Object.assign(s, { kind: "scan", url: URL.createObjectURL(s.blob) }));
    renderHist();
  }).catch(() => renderHist());

  /* ---- Map catalogue (data/maps/catalog.js): online tiles with offline backup ---- */
  const CATALOG = (window.AR_MAPS || []).slice().sort((a, b) => a.year - b.year);
  const catState = store.get("ar_catalog", {});
  const catLayers = new Map();
  const cst = (m) => (catState[m.id] = catState[m.id] || { on: false, opacity: 0.75, mode: "auto" });
  function catWindow() { return [PERIODS[pState.from].from, PERIODS[pState.to].to]; }
  function catMake(m) {
    const st = cst(m);
    const edited = gcpEdits[m.id];
    const offline = () => edited && m.original
      ? new ARGcp.WarpLayer(m.original, edited, { pane: "hist", opacity: st.opacity })
      : L.imageOverlay(m.offline.image, m.offline.bounds, { pane: "hist", opacity: st.opacity, interactive: false, attribution: `${esc(m.title)} (${m.year}), offline copy` });
    if (st.mode === "offline" || !m.online || m._failed && st.mode === "auto") {
      m._status = (st.mode === "offline" ? "offline copy" : !m.online ? "offline copy (no online tiles yet)" : "offline copy (online tiles unavailable)") + (edited ? ", your edited points" : "");
      return offline();
    }
    const o = m.online, b = o.bounds;
    const tl = L.tileLayer(o.tiles, { pane: "hist", opacity: st.opacity, maxZoom: 19, minNativeZoom: o.minzoom, maxNativeZoom: o.maxzoom,
      bounds: b ? [[b[1], b[0]], [b[3], b[2]]] : undefined, attribution: `${esc(m.title)} (${m.year}) · ${esc(o.provider || "online")}` });
    let ok = 0, bad = 0;
    m._status = "online";
    tl.on("tileload", () => { ok++; });
    tl.on("tileerror", () => {
      bad++;
      // Auto mode: switch to the offline copy if the service does not answer.
      if (st.mode === "auto" && m.offline && !ok && bad >= 3 && !m._failed) {
        m._failed = true;
        catRefresh(m);
      }
    });
    return tl;
  }
  function catRefresh(m) {
    const old = catLayers.get(m.id);
    if (old) { L_.histCat.removeLayer(old); catLayers.delete(m.id); }
    const st = cst(m);
    const [y0, y1] = catWindow();
    const inWin = !$("#catWindow").checked || (m.year >= y0 && m.year <= y1);
    if (st.on && inWin) { const l = catMake(m); catLayers.set(m.id, l); L_.histCat.addLayer(l); }
    renderCatalog();
  }
  function renderCatalog() {
    const [y0, y1] = catWindow(), win = $("#catWindow").checked;
    $("#catCount").textContent = CATALOG.length;
    $("#catList").innerHTML = CATALOG.map((m) => { const st = cst(m), out = win && (m.year < y0 || m.year > y1);
      return `<li data-id="${m.id}" style="opacity:${out ? 0.5 : 1}">
        <div class="title"><label class="chk"><input type="checkbox" data-con ${st.on ? "checked" : ""}> ${esc(m.title)}</label><span class="score">${m.year}</span></div>
        <div class="meta">${esc(m.author || "Unknown")}${out ? " · outside time window" : ""}${st.on && catLayers.has(m.id) ? " · showing " + esc(m._status || "") : ""}</div>
        <div class="row" style="margin:6px 0 0">
          <select data-cmode style="width:auto">${["auto", "online", "offline"].map((k) => `<option value="${k}" ${st.mode === k ? "selected" : ""} ${k === "online" && !m.online || k === "offline" && !m.offline ? "disabled" : ""}>${{ auto: "Auto (online, else offline)", online: "Online tiles", offline: "Offline copy" }[k]}</option>`).join("")}</select>
          <button class="btn" data-czoom title="Zoom to map">⌖</button>
          ${window.AR_GCPS && AR_GCPS[m.id] && m.original ? `<button class="btn" data-cedit>Edit points</button>` : ""}
        </div>
        <input type="range" min="0" max="1" step="0.05" value="${st.opacity}" data-cop style="width:100%;accent-color:var(--gold)">
        ${gcpEdits[m.id] ? `<div class="meta" style="color:var(--gold)">Offline copy uses your edited points (saved in this browser, ${gcpEdits[m.id].points.length} points). Export them to make them permanent.</div>` : ""}
        <div class="meta">${m.offline ? `Offline: ${esc(m.offline.method)}, ~${m.offline.error_km} km typical error · ` : ""}${m.original ? `<a href="${esc(m.original)}" target="_blank">original scan</a> · ` : ""}${m.source ? `<a href="${esc(m.source)}" target="_blank" rel="noopener">source</a>` : ""}</div>
        ${m.notes ? `<div class="body">${esc(m.notes)}</div>` : ""}</li>`; }).join("") || `<li class="meta">No maps in data/maps/catalog.js.</li>`;
    $$("#catList li[data-id]").forEach((li) => {
      const m = CATALOG.find((x) => x.id === li.dataset.id), st = cst(m);
      const save = () => store.set("ar_catalog", catState);
      li.querySelector("[data-con]").addEventListener("change", (e) => { st.on = e.target.checked; save(); catRefresh(m); });
      li.querySelector("[data-cmode]").addEventListener("change", (e) => { st.mode = e.target.value; m._failed = false; save(); catRefresh(m); });
      li.querySelector("[data-cop]").addEventListener("input", (e) => { st.opacity = +e.target.value; save(); const l = catLayers.get(m.id); if (l) l.setOpacity(st.opacity); });
      const eb = li.querySelector("[data-cedit]");
      if (eb) eb.addEventListener("click", () => openEditor(m));
      li.querySelector("[data-czoom]").addEventListener("click", () => map.flyToBounds(m.offline ? m.offline.bounds : [[m.online.bounds[1], m.online.bounds[0]], [m.online.bounds[3], m.online.bounds[2]]], { duration: 0.8 }));
    });
  }
  $("#catWindow").addEventListener("change", () => CATALOG.forEach(catRefresh));

  /* ---- Control-point editor ---- */
  let gcpEdits = store.get("ar_gcps_edit", {});
  let edDirty = false;
  const editor = ARGcp.createEditor({
    map, root: $("#gcpEd"), esc,
    onChange: () => { edDirty = true; $("#geSave").classList.add("primary"); },
    onClose: () => { const m = edMap; edMap = null; mode = null; if (m) catRefresh(m); },
  });
  let edMap = null;
  window.AR_DEBUG = { editor };
  function openEditor(m) {
    if (editor.active) editor.close();
    const old = catLayers.get(m.id);
    if (old) { L_.histCat.removeLayer(old); catLayers.delete(m.id); }
    edMap = m; mode = "gcpedit";
    editor.open(m, gcpEdits[m.id] || AR_GCPS[m.id], cst(m).opacity);
    setEdOpacity(cst(m).opacity);
    edDirty = false; $("#geSave").classList.remove("primary");
    const b = m.offline ? m.offline.bounds : null;
    if (b) map.flyToBounds(b, { duration: 0.6 });
    if (!isOn({ key: "hist", on: true })) { layerState.hist = true; applyLayers(); renderLayerList(); }
  }
  // Overlay opacity while editing (remembered per map); T toggles hide/show
  let edHidden = null;
  function setEdOpacity(v) {
    $("#geOp").value = v; $("#geOpOut").textContent = Math.round(v * 100) + "%";
    editor.setOpacity(v);
  }
  $("#geOp").addEventListener("input", (e) => {
    const v = +e.target.value; edHidden = null; setEdOpacity(v);
    if (edMap) { cst(edMap).opacity = v; store.set("ar_catalog", catState); }
  });
  document.addEventListener("keydown", (e) => {
    if (!editor.active || e.key.toLowerCase() !== "t" || /input|textarea|select/i.test(e.target.tagName)) return;
    if (edHidden == null) { edHidden = +$("#geOp").value; setEdOpacity(0); }
    else { setEdOpacity(edHidden); edHidden = null; }
  });

  $("#geSave").addEventListener("click", () => {
    if (!edMap) return;
    gcpEdits[edMap.id] = editor.gcp; store.set("ar_gcps_edit", gcpEdits);
    cst(edMap).on = true; cst(edMap).mode = "offline"; store.set("ar_catalog", catState);
    edDirty = false; $("#geSave").classList.remove("primary");
    renderCatalog();
    $("#gcpEd .gs").textContent = "Saved in this browser. The offline copy now uses these points (mode set to Offline copy).";
  });
  $("#geExport").addEventListener("click", () => {
    if (!edMap) return;
    const g = Object.assign({}, editor.gcp, { edited: new Date().toISOString() });
    download(`${edMap.id}.gcps.json`, JSON.stringify(g, null, 1), "application/json");
  });
  $("#gePoints").addEventListener("click", () => { if (edMap) download(`${edMap.id}.points`, ARGcp.toQgisPoints(editor.gcp), "text/plain"); });
  $("#geImport").addEventListener("change", async (ev) => {
    const f = ev.target.files[0]; if (!f || !edMap) return;
    const txt = await f.text();
    try {
      const g = /\.points$/i.test(f.name) ? ARGcp.fromQgisPoints(txt, editor.gcp) : JSON.parse(txt);
      if (!g.points || !g.points.length) throw new Error("no points found");
      editor.replace(Object.assign({}, editor.gcp, { points: g.points, mask: g.mask || editor.gcp.mask }));
    } catch (e) { alert("Could not import: " + e.message); }
    ev.target.value = "";
  });
  $("#geRevert").addEventListener("click", () => {
    if (!edMap || !confirm("Discard your edits and go back to the repository version of the points?")) return;
    delete gcpEdits[edMap.id]; store.set("ar_gcps_edit", gcpEdits);
    editor.replace(AR_GCPS[edMap.id]); edDirty = false; renderCatalog();
  });
  $("#gcpEd .gclose").addEventListener("click", (e) => {
    if (edDirty && !confirm("Close without saving your changes?")) { e.stopImmediatePropagation(); }
  }, true);
  CATALOG.forEach((m) => { if (cst(m).on) catRefresh(m); });
  renderCatalog();

  /* ---- Georeferencing workflow ---- */
  const gr = { img: null, blob: null, w: 0, h: 0, scale: 1, tx: 0, ty: 0, pairs: [], pendingImg: null, preview: null, mapMarkers: L.layerGroup().addTo(map) };
  const view = $("#grView");
  function grTransform() { gr.img.style.transform = `translate(${gr.tx}px,${gr.ty}px) scale(${gr.scale})`; drawGcps(); }
  function drawGcps() {
    $$(".gcp", view).forEach((e) => e.remove());
    const pts = gr.pairs.map((p) => p.img).concat(gr.pendingImg ? [gr.pendingImg] : []);
    pts.forEach((p, i) => { const d = document.createElement("div"); d.className = "gcp"; d.textContent = i + 1; d.style.left = gr.tx + p[0] * gr.scale + "px"; d.style.top = gr.ty + p[1] * gr.scale + "px"; view.appendChild(d); });
  }
  function grStatus() {
    const n = gr.pairs.length;
    let s = gr.pendingImg ? `Point ${n + 1}: now click the same place on the map.` : `Click point ${n + 1} on the scan.`;
    const fit = n >= 3 ? H.fitAffine(gr.pairs.map((p) => p.img), gr.pairs.map((p) => p.world)) : null;
    if (fit) {
      const lat = map.unproject([fit.e, fit.f], 0).lat;
      fit.rmsM = fit.rms * 156543.03 * Math.cos(lat * Math.PI / 180);
      s += ` · ${n} pairs, RMS ≈ ${Math.round(fit.rmsM)} m`;
      if (gr.preview) gr.preview.remove();
      gr.preview = new H.AffineImage(gr.img.src, fit, { pane: "hist", opacity: 0.6 }).addTo(map);
    }
    gr.fit = fit;
    $("#grStatus").textContent = s;
  }
  $("#scanFile").addEventListener("change", (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    gr.blob = f; gr.pairs = []; gr.pendingImg = null; gr.mapMarkers.clearLayers();
    view.innerHTML = "";
    gr.img = new Image();
    gr.img.onload = () => {
      gr.w = gr.img.naturalWidth; gr.h = gr.img.naturalHeight;
      const vw = view.clientWidth, vh = view.clientHeight;
      gr.scale = Math.min(vw / gr.w, vh / gr.h); gr.tx = (vw - gr.w * gr.scale) / 2; gr.ty = (vh - gr.h * gr.scale) / 2;
      grTransform(); grStatus();
    };
    gr.img.src = URL.createObjectURL(f);
    view.appendChild(gr.img);
    $("#grName").value = f.name.replace(/\.[^.]+$/, "");
    $("#georef").classList.add("open");
    mode = "georef"; ev.target.value = "";
  });
  let dragFrom = null, moved = false;
  view.addEventListener("pointerdown", (e) => { dragFrom = [e.clientX, e.clientY, gr.tx, gr.ty]; moved = false; view.setPointerCapture(e.pointerId); });
  view.addEventListener("pointermove", (e) => {
    if (!dragFrom) return;
    const dx = e.clientX - dragFrom[0], dy = e.clientY - dragFrom[1];
    if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
    if (moved) { gr.tx = dragFrom[2] + dx; gr.ty = dragFrom[3] + dy; grTransform(); }
  });
  view.addEventListener("pointerup", (e) => {
    const was = dragFrom; dragFrom = null;
    if (!was || moved || !gr.img) return;
    const r = view.getBoundingClientRect();
    gr.pendingImg = [(e.clientX - r.left - gr.tx) / gr.scale, (e.clientY - r.top - gr.ty) / gr.scale];
    drawGcps(); grStatus();
  });
  view.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = view.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, k = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    gr.tx = mx - (mx - gr.tx) * k; gr.ty = my - (my - gr.ty) * k; gr.scale *= k; grTransform();
  }, { passive: false });
  function grMapClick(latlng) {
    if (!gr.pendingImg) return;
    const w = map.project(latlng, 0);
    gr.pairs.push({ img: gr.pendingImg, world: [w.x, w.y], latlng: [latlng.lat, latlng.lng] });
    gr.mapMarkers.addLayer(L.marker(latlng, { pane: "log", icon: L.divIcon({ className: "gcp-map", html: String(gr.pairs.length), iconSize: [18, 18] }) }));
    gr.pendingImg = null; drawGcps(); grStatus();
  }
  $("#grUndo").addEventListener("click", () => {
    if (gr.pendingImg) gr.pendingImg = null; else if (gr.pairs.length) { gr.pairs.pop(); const ls = gr.mapMarkers.getLayers(); if (ls.length) gr.mapMarkers.removeLayer(ls[ls.length - 1]); }
    if (gr.pairs.length < 3 && gr.preview) { gr.preview.remove(); gr.preview = null; }
    drawGcps(); grStatus();
  });
  function closeGeoref() {
    $("#georef").classList.remove("open"); mode = null;
    if (gr.preview) { gr.preview.remove(); gr.preview = null; }
    gr.mapMarkers.clearLayers();
  }
  $("#grCancel").addEventListener("click", closeGeoref);
  $("#grSave").addEventListener("click", async () => {
    if (!gr.fit) { alert("Add at least 3 control-point pairs."); return; }
    const rec = { id: "scan_" + uid(), name: $("#grName").value || "Scan", year: +$("#grYear").value || null, blob: gr.blob, M: gr.fit,
      gcps: gr.pairs, rmsM: gr.fit.rmsM, opacity: 0.75, on: true };
    try { await H.idbPut(rec); } catch (e) { alert("Could not store the scan: " + e.message); return; }
    scans.push(Object.assign(rec, { kind: "scan", url: URL.createObjectURL(rec.blob) }));
    closeGeoref(); renderHist();
  });

  /* ---- Digitising features ---- */
  $("#digBtn").addEventListener("click", () => { mode = "digitise"; document.body.classList.add("picking"); $("#digBtn").textContent = "Click the map…"; });
  function digitiseAt(latlng) {
    const lastYear = store.get("ar_lastMapYear", "");
    const html = `<div class="filters" style="min-width:230px">
      <b>Feature from an old map</b>
      <input type="text" id="dgName" placeholder="Name (e.g. village, 'Mohyla')">
      <select id="dgType"><option value="barrow">Barrow / mound symbol</option><option value="settlement">Village / settlement</option><option value="hillfort">Earthwork / hillfort</option>
        <option value="church">Church</option><option value="mill">Mill</option><option value="manor">Manor / estate</option><option value="site">Other</option></select>
      <input type="text" id="dgMap" placeholder="Map (e.g. Schubert 3-verst)" value="${esc(store.get("ar_lastMapName", ""))}">
      <input type="number" id="dgYear" placeholder="Map year" value="${esc(lastYear)}">
      <label class="chk"><input type="checkbox" id="dgGone"> Vanished today</label>
      <textarea id="dgNotes" placeholder="Notes"></textarea>
      <button class="btn primary" id="dgSave">Save</button></div>`;
    const pop = L.popup({ maxWidth: 300 }).setLatLng(latlng).setContent(html).openOn(map);
    setTimeout(() => $("#dgSave") && $("#dgSave").addEventListener("click", () => {
      const type = $("#dgType").value, year = +$("#dgYear").value || null;
      store.set("ar_lastMapYear", year || ""); store.set("ar_lastMapName", $("#dgMap").value);
      // A barrow or earthwork symbol does not date the monument itself; buildings take the map's date.
      const periods = year && !["barrow", "hillfort"].includes(type) ? periodsForYears(year, year) : [];
      digitised.push({ id: "mf_" + uid(), source: "mapfeature", name: $("#dgName").value || type, lat: latlng.lat, lon: latlng.lng, type, periods,
        mapName: $("#dgMap").value, mapYear: year, vanished: $("#dgGone").checked, notes: $("#dgNotes").value });
      store.set("ar_digitised", digitised); map.closePopup(pop); drawSites();
    }), 0);
  }


  /* ------------------------------------------------------------------ */
  /* Promising terrain (voids) + shape recognition                       */
  /* ------------------------------------------------------------------ */
  L_.voids = L.layerGroup();
  L_.shapes = L.layerGroup();
  var places = new Map();                       // OSM settlements: id -> [lat, lon, kind, id]
  (store.get("ar_places", []) || []).forEach((p) => places.set(p[3], p));
  var placeBoxes = store.get("ar_placeboxes", []); // areas where settlements were loaded [s,w,n,e]
  var shapes = store.get("ar_shapes", []);      // detections
  var thumbs = new Map();                       // id -> data URL (session only)
  let vState = null, scanStop = false, scanError = "";
  const saveShapes = () => store.set("ar_shapes", shapes);
  function detectedSites() {
    return (typeof shapes === "undefined" ? [] : shapes).filter((d) => d.status === "confirmed").map((d) => ({
      id: d.id, source: "detected", lat: d.lat, lon: d.lon, periods: [], acc: 0.05,
      type: d.type === "circle" ? "circular feature" : "rectilinear feature",
      name: d.type === "circle" ? `Circular feature, ⌀ ${Math.round(d.r_m * 2)} m` : `Rectilinear feature, ${Math.round(d.a_m)} × ${Math.round(d.b_m)} m`,
      notes: `Detected in satellite imagery (score ${fmt(d.score)}) and confirmed by you${d.note ? ": " + d.note : ""}.`,
    }));
  }
  const bindOutV = (id, out, f) => { const el = $("#" + id); const u = () => { $("#" + out).textContent = f(+el.value); }; el.addEventListener("input", u); u(); };
  bindOutV("vD", "vDOut", (v) => fmt(v, 1) + " km");
  bindOutV("vMin", "vMinOut", (v) => fmt(v, 2).replace(/0$/, "") + " km");
  bindOutV("vShow", "vShowOut", (v) => fmt(v));
  bindOutV("vN", "vNOut", (v) => String(v));
  bindOutV("vScore", "vScoreOut", (v) => fmt(v));
  function placesStatus() {
    const b = map.getBounds();
    let n = 0; for (const p of places.values()) if (b.contains([p[0], p[1]])) n++;
    $("#vPlaces").textContent = `${places.size} settlements loaded, ${n} in view.`;
  }
  $("#vLoad").addEventListener("click", async () => {
    if (map.getZoom() < 9) { $("#vPlaces").textContent = "Zoom in to level 9 or closer first."; return; }
    const b = map.getBounds().pad(0.35); // include settlements just outside the view
    const box = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
    const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((v) => fmt(v, 4)).join(",");
    const q = `[out:json][timeout:90];node["place"~"^(city|town|village|hamlet|suburb|isolated_dwelling)$"](${bbox});out;`;
    $("#vPlaces").textContent = "Loading settlements from OpenStreetMap…";
    let data = null;
    for (const url of ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]) {
      try { const r = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q) }); if (r.ok) { data = await r.json(); break; } } catch (e) { /* next */ }
    }
    if (!data) { $("#vPlaces").textContent = "Could not reach OpenStreetMap (Overpass). Check the internet connection."; return; }
    for (const el of data.elements || []) if (el.lat) places.set("n" + el.id, [+el.lat.toFixed(5), +el.lon.toFixed(5), (el.tags || {}).place || "", "n" + el.id]);
    placeBoxes.push(box.map((v) => +v.toFixed(4)));
    store.set("ar_placeboxes", placeBoxes.slice(-400));
    const all = [...places.values()];
    store.set("ar_places", all.length > 80000 ? all.slice(-80000) : all);
    placesStatus();
  });
  map.on("moveend", () => { if ($("#pane-voids").classList.contains("active")) placesStatus(); });

  function computeVoids() {
    const b = map.getBounds(), bounds = { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast() };
    const pad = 0.6, pts = [];
    if ($("#vOsm").checked) for (const p of places.values()) {
      if (p[0] > bounds.s - pad && p[0] < bounds.n + pad && p[1] > bounds.w - pad && p[1] < bounds.e + pad) pts.push([p[0], p[1]]);
    }
    const nOsm = pts.length;
    if ($("#vSites").checked) allSites().filter(siteVisible).forEach((s) => pts.push([s.lat, s.lon]));
    if (!pts.length) { $("#vStatus").textContent = $("#vOsm").checked ? "No settlements loaded for this area: click 'Load settlements in view' first." : "No settlement source selected."; return; }
    const cols = Math.min(520, Math.max(160, Math.round(map.getSize().x / 2.5)));
    const g = ARVoids.distanceGrid(bounds, pts, cols);
    const N = g.cols * g.rows, pot = new Float32Array(N), water = new Uint8Array(N);
    // Where no settlements were loaded, "far from settlements" is unknown: leave unscored.
    // The loaded boxes include a margin, so shrink them to keep distances reliable at their edges.
    const known = (lat, lon) => !$("#vOsm").checked || placeBoxes.some(([bs, bw, bn, be]) => {
      const my = (bn - bs) * 0.12, mx = (be - bw) * 0.12;
      return lat > bs + my && lat < bn - my && lon > bw + mx && lon < be - mx;
    });
    let unknown = 0;
    const mode = $("#vPot").value;
    for (let y = 0; y < g.rows; y++) {
      const lat = g.latOfRow(y);
      for (let x = 0; x < g.cols; x++) {
        const lon = g.lonOfCol(x), sm = sampleAt(lat, lon), i = y * g.cols + x;
        if (!known(lat, lon)) { water[i] = 1; unknown++; continue; }
        if (!sm) { pot[i] = mode === "none" ? 1 : 0.5; continue; }
        if (sm.landform === 0) water[i] = 1;
        pot[i] = mode === "none" ? 1 : mode === "max" ? Math.max(sm.barrow, sm.settlement, sm.hillfort) : [sm.barrow, sm.settlement, sm.hillfort][+mode];
      }
    }
    vState = { g, pot, water, bounds, nOsm, nSites: pts.length - nOsm, unknownPct: Math.round((100 * unknown) / N) };
    renderVoids();
    if (!isOn({ key: "voids", on: true })) { layerState.voids = true; store.set("ar_layers", layerState); applyLayers(); renderLayerList(); }
  }
  // Score grid including amplification by detections (confirmed count double, rejected not at all)
  function voidScores() {
    const { g, pot, water } = vState, D = +$("#vD").value, dMin = +$("#vMin").value;
    const N = g.cols * g.rows, base = new Float32Array(N), amp = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const d = g.dist[i];
      base[i] = water[i] || d < dMin ? 0 : (1 - Math.exp(-(d - dMin) / D)) * (0.25 + 0.75 * pot[i]);
    }
    const sig = 0.5; // km
    for (const s of shapes) {
      if (s.status === "rejected") continue;
      const w = s.score * (s.status === "confirmed" ? 2 : 1) * (s.modern ? 0.3 : 1);
      const cx = ((s.lon - g.bounds.w) / (g.bounds.e - g.bounds.w)) * g.cols;
      const y0 = Math.log(Math.tan(Math.PI / 4 + (g.bounds.n * Math.PI) / 360)), y1 = Math.log(Math.tan(Math.PI / 4 + (g.bounds.s * Math.PI) / 360));
      const cy = ((y0 - Math.log(Math.tan(Math.PI / 4 + (s.lat * Math.PI) / 360))) / (y0 - y1)) * g.rows;
      const rx = Math.ceil((3 * sig) / g.dx), ry = Math.ceil((3 * sig) / g.dy);
      for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(g.rows - 1, cy + ry); y++)
        for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(g.cols - 1, cx + rx); x++) {
          const dd = ((x - cx) * g.dx) ** 2 + ((y - cy) * g.dy) ** 2;
          amp[y * g.cols + x] += w * Math.exp(-dd / (2 * sig * sig));
        }
    }
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) out[i] = Math.min(1, base[i] * (1 + 0.8 * Math.min(2, amp[i])));
    return { base, amp, out };
  }
  function renderVoids() {
    if (!vState) return;
    const { g } = vState, sc = voidScores(), show = +$("#vShow").value;
    const cv = document.createElement("canvas"); cv.width = g.cols; cv.height = g.rows;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(g.cols, g.rows);
    for (let i = 0; i < sc.out.length; i++) {
      const v = sc.out[i];
      if (v < show || v <= 0) continue;
      const t = (v - show) / Math.max(0.05, 1 - show), boosted = sc.amp[i] > 0.15;
      img.data[4 * i] = boosted ? 255 : 186; img.data[4 * i + 1] = boosted ? 64 : 104; img.data[4 * i + 2] = boosted ? 129 : 200;
      img.data[4 * i + 3] = Math.round(70 + 170 * t);
    }
    ctx.putImageData(img, 0, 0);
    L_.voids.clearLayers();
    L_.voids.addLayer(L.imageOverlay(cv.toDataURL(), [[g.bounds.s, g.bounds.w], [g.bounds.n, g.bounds.e]], { pane: "pot", opacity: 0.85, interactive: false }));
    L_.voids.addLayer(L.rectangle([[g.bounds.s, g.bounds.w], [g.bounds.n, g.bounds.e]], { pane: "pot", color: "#ba68c8", weight: 1, dashArray: "4 4", fill: false, interactive: false }));
    const pk = ARVoids.peaks(sc.out, g.cols, g.rows, g.latOfRow, g.lonOfCol, Math.max(1.5, +$("#vD").value / 2), 30, Math.max(0.05, show));
    vState.peaks = pk.map((p) => { const i = p.y * g.cols + p.x; return Object.assign(p, { base: sc.base[i], amp: sc.amp[i], dist: g.dist[i], pot: vState.pot[i] }); });
    $("#vCount").textContent = pk.length;
    $("#vStatus").textContent = `${vState.nOsm} settlements${vState.nSites ? " + " + vState.nSites + " archaeological sites" : ""} used · ${g.cols}×${g.rows} grid (${fmt(g.dx, 2)} km cells).` +
      (vState.unknownPct ? ` ${vState.unknownPct}% of the view has no settlement data and is left blank: load settlements there too.` : "");
    $("#vList").innerHTML = vState.peaks.map((p, k) => {
      const nd = shapes.filter((s) => s.status !== "rejected" && distKm(p.lat, p.lon, s.lat, s.lon) < 1.5).length;
      return `<li data-k="${k}"><div class="title"><span>Void ${k + 1}</span><span class="score">${fmt(p.v)}</span></div>
        <div class="meta">${fmt(p.dist, 1)} km from nearest settlement · potential ${fmt(p.pot)}${p.amp > 0.15 ? ` · <b style="color:#ff4081">boosted by ${nd} shape(s)</b>` : ""}</div>
        <div class="meta">${ll(p.lat, p.lon)}</div>
        <div class="row" style="margin:4px 0 0"><button class="btn" data-vz>Zoom</button><button class="btn" data-vs>Scan here</button></div></li>`;
    }).join("") || `<li class="meta">Nothing above the threshold. Lower "Show ≥" or the void scale.</li>`;
    $$("#vList li[data-k]").forEach((li) => {
      const p = vState.peaks[+li.dataset.k];
      li.querySelector("[data-vz]").addEventListener("click", () => map.flyTo([p.lat, p.lon], 15));
      li.querySelector("[data-vs]").addEventListener("click", async () => {
        $("#vScanStatus").textContent = "Scanning imagery…";
        const n = await scanAt(p.lat, p.lon);
        $("#vScanStatus").textContent = n < 0 ? scanError : `${n} shape(s) found around void ${+li.dataset.k + 1}.`;
      });
    });
  }
  $("#vRun").addEventListener("click", computeVoids);
  ["#vD", "#vMin", "#vShow"].forEach((s) => $(s).addEventListener("change", renderVoids));
  $("#vPot").addEventListener("change", () => { if (vState) computeVoids(); });

  // Scan imagery around a point (3x3 tiles at zoom 17, ~600 m square)
  async function scanAt(lat, lon) {
    let win;
    try { win = await ARShapes.loadWindow($("#vImg").value.trim(), lat, lon, 17, 1); }
    catch (e) { scanError = "Imagery could not be loaded or read (" + e.message + "). Check the internet connection, or use an imagery URL that allows cross-origin access."; return -1; }
    let dets;
    try { dets = ARShapes.detect(win, { minScore: +$("#vScore").value }); }
    catch (e) { scanError = "Imagery could not be analysed (" + e.message + "). The imagery server must allow cross-origin reading."; return -1; }
    let added = 0;
    for (const d of dets) {
      if (shapes.some((s) => s.type === d.type && distKm(s.lat, s.lon, d.lat, d.lon) < 0.015)) continue;
      const id = "det_" + uid();
      shapes.push({ id, type: d.type, lat: +d.lat.toFixed(6), lon: +d.lon.toFixed(6), r_m: d.r_m, a_m: d.a_m, b_m: d.b_m,
        corners: d.corners ? d.corners.map((c) => [+c[0].toFixed(6), +c[1].toFixed(6)]) : null,
        score: +d.score.toFixed(3), modern: d.modern, status: "new", found: new Date().toISOString().slice(0, 10) });
      const th = ARShapes.thumbnail(win, d); if (th) thumbs.set(id, th);
      added++;
    }
    saveShapes(); drawShapes(); renderVoids(); renderDetList();
    if (!isOn({ key: "shapes", on: true })) { layerState.shapes = true; store.set("ar_layers", layerState); applyLayers(); renderLayerList(); }
    return added;
  }
  $("#vScan").addEventListener("click", async () => {
    if (!vState || !vState.peaks || !vState.peaks.length) { $("#vScanStatus").textContent = "Compute promising terrain first."; return; }
    scanStop = false;
    const list = vState.peaks.slice(0, +$("#vN").value);
    let total = 0;
    for (let k = 0; k < list.length && !scanStop; k++) {
      $("#vScanStatus").textContent = `Scanning void ${k + 1} of ${list.length}…`;
      const n = await scanAt(list[k].lat, list[k].lon);
      if (n < 0) { $("#vScanStatus").textContent = scanError; return; }
      total += n;
    }
    $("#vScanStatus").textContent = `${scanStop ? "Stopped" : "Done"}: ${total} new shape(s). Review them below; confirmed ones count double.`;
  });
  $("#vStop").addEventListener("click", () => { scanStop = true; });
  $("#vClearDet").addEventListener("click", () => { shapes = shapes.filter((s) => s.status !== "new"); saveShapes(); drawShapes(); renderVoids(); renderDetList(); });

  function shapeLabel(s) {
    return s.type === "circle" ? `Circle ⌀ ${Math.round(s.r_m * 2)} m` : `Rectangle ${Math.round(s.a_m)} × ${Math.round(s.b_m)} m`;
  }
  function shapePopup(s) {
    const th = thumbs.get(s.id);
    return `<h4>${shapeLabel(s)}</h4><div class="big-score">${fmt(s.score)}</div>
      ${s.modern ? `<span class="tag warn">colour suggests a modern object</span>` : ""}<span class="tag">${s.status === "new" ? "unreviewed" : s.status}</span>
      ${th ? `<img class="detimg" src="${th}" alt="imagery">` : `<div class="meta">Thumbnail not kept between sessions: switch the basemap to Satellite and zoom in.</div>`}
      <div class="meta">${ll(s.lat, s.lon)} · found ${s.found}</div>
      <div class="row"><button class="btn primary" data-dconf="${s.id}">Confirm</button><button class="btn" data-drej="${s.id}">Reject</button><button class="btn" data-dz="${s.id}">Zoom</button></div>`;
  }
  function setStatus(id, st) {
    const s = shapes.find((x) => x.id === id); if (!s) return;
    s.status = s.status === st ? "new" : st;
    saveShapes(); drawShapes(); renderVoids(); renderDetList(); drawSites(); map.closePopup();
  }
  function drawShapes() {
    L_.shapes.clearLayers();
    for (const s of shapes) {
      if (s.status === "rejected") continue;
      const col = s.status === "confirmed" ? "#43a047" : s.modern ? "#90a4ae" : "#ffd54f";
      const opt = { pane: "survey", color: col, weight: 2.5, dashArray: s.status === "confirmed" ? null : "5 4", fillOpacity: 0.08 };
      const lay = s.type === "circle" ? L.circle([s.lat, s.lon], Object.assign({ radius: s.r_m }, opt)) : L.polygon(s.corners, opt);
      // a small marker so the feature can be found when zoomed out
      const dot = L.circleMarker([s.lat, s.lon], { pane: "survey", radius: 4, color: "#111", weight: 1, fillColor: col, fillOpacity: 1, bubblingMouseEvents: false });
      [lay, dot].forEach((l) => { l.bindPopup(() => shapePopup(s), { maxWidth: 260 }); L_.shapes.addLayer(l); });
    }
  }
  map.on("popupopen", (e) => {
    const el = e.popup.getElement();
    el.querySelectorAll("[data-dconf]").forEach((b) => b.addEventListener("click", () => setStatus(b.dataset.dconf, "confirmed")));
    el.querySelectorAll("[data-drej]").forEach((b) => b.addEventListener("click", () => setStatus(b.dataset.drej, "rejected")));
    el.querySelectorAll("[data-dz]").forEach((b) => b.addEventListener("click", () => { const s = shapes.find((x) => x.id === b.dataset.dz); map.flyTo([s.lat, s.lon], 17); }));
  });
  function renderDetList() {
    const f = $("#dFilter").value;
    const list = shapes.filter((s) => f === "all" || (f === "confirmed" ? s.status === "confirmed" : s.status !== "rejected"))
      .sort((a, b) => (b.status === "confirmed") - (a.status === "confirmed") || b.score - a.score);
    $("#dCount").textContent = list.length;
    $("#dList").innerHTML = list.slice(0, 200).map((s) => {
      const th = thumbs.get(s.id);
      return `<li class="det ${s.status}" data-id="${s.id}">${th ? `<img src="${th}" alt="">` : ""}<div class="info">
        <div class="title"><span>${shapeLabel(s)}</span><span class="score">${fmt(s.score)}</span></div>
        <div class="meta">${s.status === "new" ? "unreviewed" : s.status}${s.modern ? " · looks modern" : ""} · ${ll(s.lat, s.lon)}</div>
        <div class="row"><button class="btn" data-dconf="${s.id}">${s.status === "confirmed" ? "Unconfirm" : "Confirm"}</button><button class="btn" data-drej="${s.id}">${s.status === "rejected" ? "Restore" : "Reject"}</button><button class="btn" data-dz="${s.id}">Zoom</button></div></div></li>`;
    }).join("") || `<li class="meta">No detections yet.</li>`;
    $$("#dList [data-dconf]").forEach((b) => b.addEventListener("click", () => setStatus(b.dataset.dconf, "confirmed")));
    $$("#dList [data-drej]").forEach((b) => b.addEventListener("click", () => setStatus(b.dataset.drej, "rejected")));
    $$("#dList [data-dz]").forEach((b) => b.addEventListener("click", () => { const s = shapes.find((x) => x.id === b.dataset.dz); map.flyTo([s.lat, s.lon], 17); }));
  }
  $("#dFilter").addEventListener("change", renderDetList);
  drawShapes(); renderDetList(); placesStatus();

  /* ------------------------------------------------------------------ */
  /* Map click dispatcher                                                */
  /* ------------------------------------------------------------------ */
  let mode = null;
  map.on("click", (e) => {
    const { lat, lng } = e.latlng;
    if (editor.active) { editor.handleMapClick(e.latlng); return; }
    if (mode === "georef") { grMapClick(e.latlng); return; }
    if (mode === "dbdraw") { drawing.push([lat, lng]); areaLayer.setLatLngs(drawing); return; }
    if (mode === "log") { mode = null; document.body.classList.remove("picking"); $("#logAdd").textContent = "Add record"; addLog(lat, lng, "find"); return; }
    if (mode === "digitise") { mode = null; document.body.classList.remove("picking"); $("#digBtn").textContent = "Digitise feature"; digitiseAt(e.latlng); return; }
    inspect(lat, lng);
  });
  map.on("dblclick", () => { if (mode === "dbdraw") { drawing.pop(); finishDraw(); } });

  /* ------------------------------------------------------------------ */
  /* Tabs, panel, guide, boot                                            */
  /* ------------------------------------------------------------------ */
  function showTab(name) {
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
    $$(".pane").forEach((p) => p.classList.toggle("active", p.id === "pane-" + name));
  }
  $$(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));
  $("#panelToggle").addEventListener("click", () => { document.body.classList.add("panel-hidden"); map.invalidateSize(); });
  $("#panelShow").addEventListener("click", () => { document.body.classList.remove("panel-hidden"); map.invalidateSize(); });
  $("#pane-guide").innerHTML = window.AR_GUIDE();
  $$("[data-goto]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); showTab("guide"); const el = document.getElementById(a.dataset.goto); if (el) el.scrollIntoView(); }));

  renderPeriods();
  drawSites();
  drawLog();
  applyLayers();
  loadRasters().catch((e) => { $("#loading").textContent = "Could not load terrain rasters: " + e.message; console.error(e); });
})();
