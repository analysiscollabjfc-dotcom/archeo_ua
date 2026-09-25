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
      bounds: [[43.741491, 25.277441], [52.138913, 41.814722]],
      method: "thin-plate spline, 22 control points",
      error_km: 35.4,
    },
    original: "data/maps/tabula_ukrainska_1639.jpg",
    gcps: "data/maps/tabula_ukrainska_1639.gcps.json",
  },
  {
    id: "beauplan_delineatio_generalis_1648",
    title: "Delineatio Generalis Camporum Desertorum vulgo Ukraina",
    year: 1648,
    author: "Guillaume Le Vasseur de Beauplan",
    notes: "General map of Ukraine, engraved by W. Hondius (Gdańsk). South at the top. Much more accurate than the 1639 sketch in the Dnipro basin; edges (Azov, Kuban, Walachia, Volhynia) are rougher. No online tiles yet: add a MapTiler TileJSON here when available.",
    source: null,
    online: null,
    offline: {
      image: "data/maps/beauplan_delineatio_generalis_1648.warped.webp",
      bounds: [[44.568971, 23.867919], [52.480669, 39.39115]],
      method: "thin-plate spline, 39 control points",
      error_km: 31.1,
    },
    original: "data/maps/beauplan_delineatio_generalis_1648.jpg",
    gcps: "data/maps/beauplan_delineatio_generalis_1648.gcps.json",
  },
];
