# Archeo UA

A local, in-browser GIS for archaeological desk-based work in Ukraine. It shows sites for all periods at once with a time filter, models site potential and expected **depth of cultural layers** from terrain, overlays and georeferences **historical maps**, and produces **survey plans** and **desk-based assessment reports**.

> Site locations are sensitive. Keep this repository private and share exports only with project partners.

## Run it

```bash
python3 -m http.server 8000   # then open http://localhost:8000
# or open index.html directly
```

Works offline except for basemap tiles, online historical map layers and the OSM/Wikidata loaders. Choose **Offline (no tiles)** in the layer switcher when you have no connection.

## Features

| Tab | What it does |
|---|---|
| **Periods** | 15 periods from the Lower Palaeolithic to 1945, each a toggle, all visible at once, plus a two-handle time-window slider and an "undated" switch |
| **Layers** | Settlement / barrow / hillfort potential (off by default; S/B/H buttons on the map; "show potential ≥" threshold), landforms, DEM streams, shaded relief, landscape zones; online loaders for OSM archaeological sites (view) and Wikidata (all Ukraine) |
| **Sites** | Search and filter; **import CSV/GeoJSON** (`name, lat, lon, period, type, notes, depth`); export |
| **Old maps** | Add online tile or WMS historical maps; **georeference your scans** in the browser (control points, affine, RMS shown); **swipe** comparison; **digitise** barrow symbols, vanished villages, mills and earthworks |
| **Survey** | Rank local maxima of a potential surface in the current view, excluding known sites if you want; export GPX/GeoJSON/CSV |
| **Promising** | Voids between settlements (OSM villages and/or known sites) weighted by site potential; satellite-imagery scan for circles and rectangles (crop/soil marks, barrows, enclosures) that amplifies the score; review with Confirm / Reject; confirmed features become sites |
| **Assessment** | Draw a project polygon: sites within a buffer, share of high potential, landform composition, depth table by landform and period; printable report |
| **Inspect** | Click anywhere: landform, elevation, height above stream, slope, the three potentials, **expected depth per period**, nearest sites |
| **Field log** | Finds and **depth observations**. Observations calibrate the depth model within ~20 km |

## Models (details in the Guide tab)

**Terrain** (from the Copernicus GLO-30 DEM, `tools/terrain.py`): flow routing, height above nearest drainage (HAND), slope, topographic position at 1 km and 5 km, stream distance, and landform classes (floodplain, terrace, footslope, slope, plateau, ridge).

**Site potential**: a fuzzy rule model per site type (settlement, barrow, hillfort), weighted by landscape zone. Values are relative. Calibrate or replace it once a register is imported.

**Depth**: top of cultural layer ≈ period age × landform burial rate (capped), with loess for the Palaeolithic, post-medieval colluvium on footslopes, and a plough-zone flag. Calibration uses the inverse-distance-weighted ratio of observed to predicted depth from your field observations and imported sites with a `depth` value.

## Data

- `data/raster_ukraine.js`: national terrain and potential grid (~600 m).
- `data/raster_talne_30m.js`: demo 30 m study area around the Trypillia mega-sites (exported at ~50 m).
- `data/streams_*.js`: DEM stream networks.
- `data/relief_ua.jpg`: shaded relief.
- `data/sites.js`: a small starter set of well-known published sites with approximate positions. It is not a register.
- `data/periods.js`, `data/zones.js`: period table and schematic landscape zones.
- `data/base.js`: Natural Earth border, oblasts, cities.

DEM: Copernicus GLO-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the EU and ESA.

## Historical map catalogue

`data/maps/catalog.js` lists the old maps, sorted by year in the **Old maps** tab. Each map has:

- **online tiles** (e.g. georeferenced in MapTiler Cloud). Tiles are stretched beyond the service's maximum zoom, so the map does not disappear when you zoom in.
- an **offline copy**: the original scan in `data/maps/` warped with a thin-plate spline by `tools/warp_map.py` from its control-point file `<id>.gcps.json`.

The default **Auto** mode uses the online tiles and switches to the offline copy when they fail to load.

**Editing control points:** click **Edit points** on a catalogue map.
- Drag points on the scan or pins on the map, add pairs, or untick doubtful points. The warp preview and each point's error update live.
- **Save** stores the points in the browser; the offline copy then uses them.
- **Export .gcps.json** and replace `data/maps/<id>.gcps.json`, then rerun `tools/warp_map.py` to make the edit permanent.
- QGIS `.points` files can be imported and exported.

To add a map:

1. Copy the scan to `data/maps/<id>.jpg`.
2. Write `data/maps/<id>.gcps.json`: control points as pixel `[x, y]` on the scan plus `lat`/`lon`, and an optional `mask` polygon (the neatline).
3. Run `python3 tools/warp_map.py data/maps/<id>.gcps.json`. This writes `<id>.warped.webp`, `<id>.warp.json` (bounds and error estimate) and `<id>.points`, a QGIS Georeferencer file you can refine in QGIS.
4. Add an entry to `catalog.js`.

| Year | Map | Author | Offline fit |
|---|---|---|---|
| 1639 | Tabula geographica Ukrainska | Unknown | TPS, 22 points, ~35 km typical error (median 26 km) |
| 1648 | Delineatio Generalis Camporum Desertorum vulgo Ukraina | Guillaume Le Vasseur de Beauplan | TPS, 39 points, ~31 km typical error, median 12 km (core Dnipro basin 2–15 km) |

## Adding a 30 m study area

1. Add `name_30m: (west, south, east, north, 1, 3600)` to `REGIONS` in `tools/dem_fetch.py`.
2. Run:
   ```bash
   pip install rasterio pysheds scipy shapely pillow numpy
   python3 tools/dem_fetch.py dem/ name_30m
   python3 tools/terrain.py dem/ name_30m
   ```
3. Add `data/raster_name_30m.js` and `data/streams_name_30m.js` to `index.html`.

To rebuild the national grid: `python3 tools/dem_fetch.py dem/ ukraine_ov8 && python3 tools/terrain.py dem/ ukraine_ov8`.

Leaflet 1.9.4 (BSD-2) is vendored in `vendor/leaflet`.
