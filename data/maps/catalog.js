/*
 * Historical map catalogue.
 *
 * Each map has an ONLINE layer (tiles georeferenced elsewhere, e.g. MapTiler
 * Cloud) and an OFFLINE backup: the original scan kept in this repository and
 * warped here with tools/warp_map.py (thin-plate spline from *.gcps.json).
 * The app uses the online tiles and falls back to the offline image when the
 * tiles cannot be loaded.
 *
 * To add a map: put the scan in data/maps/, write <id>.gcps.json (control
 * points), run  python3 tools/warp_map.py data/maps/<id>.gcps.json  and add
 * an entry below with the numbers from <id>.warp.json.
 */
window.AR_MAPS = [
  {
    id: "tabula_ukrainska_1639",
    title: "Tabula geographica Ukrainska",
    year: 1639,
    author: "Unknown",
    notes: "Manuscript map, south at the top. Preserved in F. Getkant's 'Topographica practica'; often attributed to G. Le Vasseur de Beauplan in the literature. Positions are approximate: expect errors of tens of km, largest towards the Don, Danube and Volhynia.",
    source: "https://archive.org/details/Ukrainae1",
    online: {
      provider: "MapTiler Cloud",
      tilejson: "https://api.maptiler.com/tiles/01a0d8c4-2daf-7835-8628-6ef5a2ea11d8/tiles.json?key=vKTy9DEmMMCiTs6D1tyl",
      tiles: "https://api.maptiler.com/tiles/01a0d8c4-2daf-7835-8628-6ef5a2ea11d8/{z}/{x}/{y}.webp?key=vKTy9DEmMMCiTs6D1tyl",
      minzoom: 4, maxzoom: 9,
      bounds: [24.499813256162565, 43.04164189863453, 39.062269384752604, 53.09590769653807],
    },
    offline: {
      image: "data/maps/tabula_ukrainska_1639.warped.webp",
      bounds: [[43.743979, 25.269938], [52.140581, 41.871987]],
      method: "thin-plate spline, 22 control points",
      error_km: 35.3,
    },
    original: "data/maps/tabula_ukrainska_1639.jpg",
    gcps: "data/maps/tabula_ukrainska_1639.gcps.json",
  },
];
