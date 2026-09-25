/*
 * Estimated depth of archaeological deposits.
 *
 * depth to top of cultural layer ≈ age × burial rate(landform), capped
 *   + extra colluvium on footslopes for pre-1800 sites in farmed zones
 *   Palaeolithic: Pleistocene loess accumulation added for the part of the
 *   age before 11.7 ka.
 * If the predicted top is shallower than the plough zone, the layer is
 * likely disturbed and artefacts should appear in the ploughsoil.
 *
 * Rates are broad literature-style ranges for the East European plain and
 * are meant as a starting point. Recorded depths (field log observations)
 * calibrate them locally: the prediction is multiplied by an
 * inverse-distance-weighted mean of observed/predicted ratios.
 */
(function () {
  "use strict";

  const NOW = new Date().getFullYear();
  const HOLOCENE = 11700; // years BP

  // landform id -> burial rate (mm/yr) [lo, hi], cap (m) [lo, hi]
  const LANDFORMS = [
    { id: 0, key: "water", name: "Water / sea", rate: [0, 0], cap: [0, 0], color: "#3b6e99",
      note: "Open water or reservoir. Submerged or flooded sites only." },
    { id: 1, key: "floodplain", name: "Floodplain", rate: [0.5, 2.0], cap: [2.5, 6], color: "#4fc3f7",
      note: "Active alluvial aggradation buries sites quickly. Older layers can be several metres down or eroded by channel migration." },
    { id: 2, key: "terrace", name: "Low terrace", rate: [0.1, 0.35], cap: [1.2, 2.5], color: "#aed581",
      note: "Loamy terrace cover plus occasional high floods. Preferred settlement position." },
    { id: 3, key: "footslope", name: "Footslope (colluvial)", rate: [0.3, 1.2], cap: [1.5, 3.5], color: "#ffb74d",
      note: "Slope wash accumulates, strongly accelerated by ploughing since the 18th–19th c. Sites can be sealed under 0.5–2 m of colluvium." },
    { id: 4, key: "slope", name: "Slope", rate: [0.0, 0.08], cap: [0.3, 0.6], color: "#e57373",
      note: "Erosional: cultural layers are often truncated and material is in the ploughsoil or washed downslope." },
    { id: 5, key: "plateau", name: "Plateau / interfluve", rate: [0.05, 0.15], cap: [0.6, 1.2], color: "#fff176",
      note: "Stable surface. Chernozem growth and bioturbation (earthworms, rodents) slowly sink artefacts, typically within the humus horizon." },
    { id: 6, key: "ridge", name: "Ridge / crest", rate: [0.0, 0.05], cap: [0.2, 0.5], color: "#ba68c8",
      note: "Exposed and eroding. Barrow mounds are often ploughed down; features are shallow." },
  ];

  const LOESS_RATE = [0.05, 0.25]; // mm/yr, Late Pleistocene loess on the plain

  // Typical thickness of the cultural deposit itself (m) by site type
  const THICKNESS = {
    settlement: [0.2, 0.8], city: [1.0, 5.0], hillfort: [0.5, 2.0], barrow: [0, 0], burial: [0.5, 2.0],
    fortress: [0.5, 2.5], battlefield: [0, 0.3], workshop: [0.2, 1.0], cave: [0.5, 3.0], rockart: [0, 0], findspot: [0, 0.2],
  };

  function periodAge(p) {
    // mid-point age in years before present
    const mid = (p.from + p.to) / 2;
    return Math.max(50, NOW - mid);
  }

  /*
   * lf: landform id, p: period object, zone: zone object (for plough depth),
   * type: site type (optional). Returns ranges in metres.
   */
  function estimate(lf, p, zone, type) {
    const L = LANDFORMS[lf] || LANDFORMS[5];
    const age = periodAge(p);
    const notes = [L.note];
    let lo, hi;
    if (lf === 0) return { top: null, base: null, notes: [L.note], landform: L };

    const holo = Math.min(age, HOLOCENE);
    lo = Math.min((holo * L.rate[0]) / 1000, L.cap[0]);
    hi = Math.min((holo * L.rate[1]) / 1000, L.cap[1]);

    if (age > HOLOCENE) {
      const pl = age - HOLOCENE;
      // Pleistocene loess mantles terraces, plateaux and footslopes; less on steep slopes.
      const k = lf === 4 || lf === 6 ? 0.3 : 1;
      // Loess cover on the plain is rarely more than ~10-20 m thick in total.
      lo += Math.min((pl * LOESS_RATE[0] * k) / 1000, 6 * k);
      hi += Math.min((pl * LOESS_RATE[1] * k) / 1000, 15 * k);
      notes.push("Palaeolithic: expect deposits within loess–palaeosol sequences. Depth depends on local stratigraphy; terrace scarps, ravines and quarries expose them.");
      if (age > 130000) notes.push("Lower/Middle Palaeolithic: the range reflects total loess thickness, not a modelled horizon. Use the local loess–palaeosol stratigraphy.");
    }

    const farmed = zone && ["foreststeppe", "steppe", "drysteppe", "polissia"].includes(zone.id);
    if (lf === 3 && farmed && p.to < 1800) {
      lo += 0.2; hi += 0.8;
      notes.push("Footslope in farmed land: + 0.2–0.8 m of post-medieval agricultural colluvium.");
    }

    const plough = zone && zone.plough ? zone.plough : [0.25, 0.35];
    const surface = hi <= plough[1];
    if (surface) notes.push(`Predicted top is within the plough zone (${plough[0]}–${plough[1]} m): expect a surface scatter; intact features only where cut into the subsoil.`);

    const th = THICKNESS[type] || THICKNESS.settlement;
    if (type === "barrow") {
      notes.push("Barrows: primary burials usually lie 0.5–3 m below the buried ancient soil under the mound; mound fill from < 1 m (ploughed) to > 10 m. Secondary burials occur in the mound itself.");
    }
    return {
      top: [round(lo), round(Math.max(hi, lo))],
      base: [round(lo + th[0]), round(Math.max(hi, lo) + th[1])],
      plough, surface, notes, landform: L, age,
    };
  }

  function round(v) { return Math.round(v * 100) / 100; }

  /*
   * Calibration from recorded observations:
   *   obs: [{lat, lon, lf, periodId, depthTop}]
   * Returns a function (lat, lon, lf) -> { factor, n }.
   */
  function calibrator(obs, periodsById, zoneAt, distKm) {
    const usable = obs.filter((o) => o.depthTop > 0 && periodsById[o.periodId] && o.lf != null && o.lf !== 0);
    const ratios = usable.map((o) => {
      const e = estimate(o.lf, periodsById[o.periodId], zoneAt(o.lat, o.lon));
      const mid = e.top ? (e.top[0] + e.top[1]) / 2 : 0;
      return { o, r: mid > 0.02 ? o.depthTop / mid : null };
    }).filter((x) => x.r && isFinite(x.r));
    return function (lat, lon, lf) {
      let sw = 0, s = 0, n = 0;
      for (const { o, r } of ratios) {
        const d = distKm(lat, lon, o.lat, o.lon);
        if (d > 20) continue;
        const w = (1 / (d * d + 1)) * (o.lf === lf ? 2 : 1);
        sw += w; s += w * Math.log(r); n++;
      }
      if (!n) return { factor: 1, n: 0 };
      return { factor: Math.min(5, Math.max(0.2, Math.exp(s / sw))), n };
    };
  }

  window.ARDepth = { LANDFORMS, THICKNESS, LOESS_RATE, estimate, calibrator, periodAge };
})();
