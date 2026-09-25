/*
 * Schematic natural (landscape) zones of Ukraine. Coordinates [lat, lon].
 * Used as prior weights in the site-potential model (tools/terrain.py reads
 * this file through node) and to pick soil / burial defaults in js/depth.js.
 *
 * weights: prior likelihood multipliers per site type (barrow, settlement, hillfort)
 * soil:    dominant soil, used by the depth model
 * plough:  typical plough-zone depth range (m) on arable land
 */
window.AR_ZONES = [
  { id: "polissia", name: "Polissia (mixed forest)", name_uk: "Полісся", soil: "sod-podzolic sands and loams",
    weights: { barrow: 0.35, settlement: 0.8, hillfort: 0.75 }, plough: [0.2, 0.3], color: "#4e7d4e",
    poly: [[52.5,23.5],[52.5,35.5],[51.3,35.5],[51.0,33.5],[50.7,32.0],[50.4,30.5],[50.6,28.0],[50.5,26.0],[50.2,23.5]] },
  { id: "foreststeppe", name: "Forest-steppe", name_uk: "Лісостеп", soil: "grey forest soils and podzolised / typical chernozem on loess",
    weights: { barrow: 0.8, settlement: 1.0, hillfort: 1.0 }, plough: [0.25, 0.35], color: "#9c8a3c",
    poly: [[50.2,23.5],[50.5,26.0],[50.6,28.0],[50.4,30.5],[50.7,32.0],[51.0,33.5],[51.3,35.5],[50.6,40.5],[50.0,38.0],[49.6,36.0],[49.0,34.0],[48.8,32.0],[48.6,30.0],[48.2,28.0],[48.0,26.0],[48.6,24.5],[49.3,23.5]] },
  { id: "carpathians", name: "Carpathians and Transcarpathia", name_uk: "Карпати і Закарпаття", soil: "brown mountain soils; alluvial lowland",
    weights: { barrow: 0.3, settlement: 0.6, hillfort: 0.8 }, plough: [0.2, 0.3], color: "#6d5a8a",
    poly: [[49.3,22.0],[49.3,23.5],[48.6,24.5],[48.0,26.0],[47.7,25.5],[47.8,24.0],[48.0,22.0]] },
  { id: "steppe", name: "Steppe", name_uk: "Степ", soil: "ordinary and southern chernozem on loess",
    weights: { barrow: 1.0, settlement: 0.8, hillfort: 0.6 }, plough: [0.25, 0.35], color: "#c49a4a",
    poly: [[48.2,28.0],[48.6,30.0],[48.8,32.0],[49.0,34.0],[49.6,36.0],[50.0,38.0],[50.6,40.5],[47.0,40.5],[46.9,37.5],[46.8,35.5],[46.9,34.0],[46.6,32.5],[46.5,31.0],[46.5,30.0],[46.3,29.5],[46.6,28.2],[47.5,28.0]] },
  { id: "drysteppe", name: "Dry steppe (south, N Crimea)", name_uk: "Сухий степ", soil: "chestnut soils and southern chernozem",
    weights: { barrow: 1.0, settlement: 0.6, hillfort: 0.5 }, plough: [0.25, 0.35], color: "#d1b36b",
    poly: [[46.9,37.5],[46.8,35.5],[46.9,34.0],[46.6,32.5],[46.5,31.0],[46.5,30.0],[46.3,29.5],[45.2,28.2],[45.0,30.0],[45.8,33.0],[45.5,35.5],[45.9,37.0]] },
  { id: "crimeamtn", name: "Crimean mountains", name_uk: "Кримські гори", soil: "mountain brown soils",
    weights: { barrow: 0.5, settlement: 0.8, hillfort: 1.0 }, plough: [0.2, 0.3], color: "#7a6a5a",
    poly: [[45.0,33.4],[44.4,33.5],[44.4,34.5],[44.9,35.5],[45.1,35.0],[45.0,34.0]] }
];
