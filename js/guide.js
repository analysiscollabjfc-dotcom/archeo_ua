/* Method and reference notes shown in the Guide tab. */
window.AR_GUIDE = function () {
  const D = window.ARDepth;
  const lfRows = D.LANDFORMS.filter((l) => l.id).map((l) =>
    `<tr><td><span class="dot" style="background:${l.color}"></span> ${l.name}</td><td>${l.rate[0]}–${l.rate[1]}</td><td>${l.cap[0]}–${l.cap[1]}</td><td>${l.note}</td></tr>`).join("");
  const thRows = Object.entries(D.THICKNESS).map(([k, v]) => `<tr><td>${k}</td><td>${v[0]}–${v[1]} m</td></tr>`).join("");
  return `
<div class="callout"><b>Professional use.</b> Site locations — especially predicted and unpublished ones — are sensitive. Keep this repository private, share exports only with project partners, and follow the permit and reporting requirements for fieldwork in Ukraine. Areas exposed by the 2023 Kakhovka reservoir drainage and front-line regions are at acute risk of looting and contain mines/UXO.</div>

<h2>1 · What the app does</h2>
<ul>
  <li><b>Periods</b>: every period is a toggle; all checked periods are displayed together, and the two-handle slider limits the time window.</li>
  <li><b>Sites</b> from a curated starter list, your imports (CSV/GeoJSON), OpenStreetMap, Wikidata and features you digitise from old maps.</li>
  <li><b>Site potential</b> for settlements, barrows and hillforts from terrain (Copernicus GLO-30 DEM).</li>
  <li><b>Expected depth</b> of the cultural layer for each period at any point, calibrated by your own depth observations.</li>
  <li><b>Historical maps</b>: online tile/WMS layers and your own scans georeferenced in the browser, with a swipe comparison.</li>
  <li><b>Survey planning</b> (ranked candidates → GPX) and <b>desk-based assessment</b> (polygon → printable report).</li>
</ul>

<h2>2 · Terrain variables</h2>
<table class="simple">
  <tr><th>Variable</th><th>Meaning</th></tr>
  <tr><td>HAND</td><td>Height above the nearest drainage line (streams from D8 flow routing, ≥ 5 km² catchment nationally, ≥ 1 km² in 30 m study areas).</td></tr>
  <tr><td>Slope</td><td>Degrees. Coarse grids underestimate slope, so thresholds are lower for the national grid.</td></tr>
  <tr><td>TPI 1 km / 5 km</td><td>Elevation minus mean elevation within ~1 km / ~5 km: ridges and spurs are positive, valleys negative.</td></tr>
  <tr><td>Stream distance</td><td>Distance to the nearest stream cell.</td></tr>
  <tr><td>Landform</td><td>Floodplain (HAND &lt; 2.5 m), low terrace (2.5–15 m, flat), footslope (gentle, concave, &lt; 30 m above stream), slope, plateau (≥ 15 m, flat), ridge (high TPI).</td></tr>
</table>

<h2>3 · Site-potential model</h2>
<p>Fuzzy rule model; each factor is a 0–1 ramp, multiplied together, weighted by the landscape zone, then sharpened (power 1.5):</p>
<ul>
  <li><b>Settlements</b>: close to water (decays over ~400 m beyond 100 m), 2–15 m above the stream (dry but near), gentle slopes, slight preference for south-facing slopes, floodplains strongly down-weighted.</li>
  <li><b>Barrows</b>: high regional position (TPI 5 km), flat to gentle, well above streams (&gt; 10–35 m), local crest bonus. Zone weight highest in the steppe.</li>
  <li><b>Hillforts</b>: promontories and spurs (high TPI 1 km), strong local relief, steep sides nearby, within ~1.5 km of a river, well above it.</li>
</ul>
<p><b>Known gap:</b> the settlement rule is generic (valley-side settlement). Some cultures chose differently, e.g. Trypillia mega-sites on broad interfluve plateaus away from streams, or Scythian forest-steppe hillforts on plateau edges. Period-specific rules or a model trained on your register will capture this.</p>
<p>Values are <em>relative</em> within the model, not probabilities. Once you import a register, compare known sites against the layers; the weights are at the top of <code>tools/terrain.py</code> and can be tuned or replaced by a trained model (e.g. logistic regression or MaxEnt on the same variables).</p>

<h2>4 · Depth model</h2>
<p><b>Top of cultural layer</b> ≈ period mid-age × burial rate for the landform (capped). Palaeolithic periods add Pleistocene loess accumulation (${D.LOESS_RATE[0]}–${D.LOESS_RATE[1]} mm/yr, reduced on slopes and ridges). Footslopes in farmed zones get an extra 0.2–0.8 m of post-medieval colluvium for pre-1800 sites. If the predicted top is within the plough zone (0.2–0.35 m by zone), a surface scatter is expected.</p>
<table class="simple"><tr><th>Landform</th><th>Rate mm/yr</th><th>Cap m</th><th>Notes</th></tr>${lfRows}</table>
<p><b>Base</b> = top + typical deposit thickness:</p>
<table class="simple"><tr><th>Site type</th><th>Thickness</th></tr>${thRows}</table>
<p><b>Calibration.</b> Every <em>depth observation</em> in the Field log (and every imported site with a <code>depth</code> value) gives a ratio observed / predicted. Predictions within 20 km are multiplied by the inverse-distance-weighted geometric mean of these ratios (same landform counts double), limited to ×0.2–×5. The inspector shows how many observations were used.</p>

<h2>5 · Historical maps</h2>
<ul>
  <li><b>Online</b>: paste a tile template (<code>https://…/{z}/{x}/{y}.png</code>) or a WMS base URL plus layer name. Useful series for Ukraine: Habsburg military surveys (Galicia, Bukovina, Transcarpathia), Schubert / Russian 3-verst military topographic maps (1840s–1910s), Polish WIG 1:100k (interwar, west), Soviet 1:100k/1:50k (1940s–80s), German WWII aerial photography. Availability and terms vary by provider.</li>
  <li><b>Scans</b>: stored in this browser (IndexedDB). Affine fit from ≥ 3 control points; use 6–10 well-spread points and check the RMS. Sheets with strong distortion or other projections need more points than an affine fit handles; georeference those in QGIS and add them as tiles.</li>
  <li><b>Catalogue maps</b> (<code>data/maps/catalog.js</code>) have online tiles and an offline copy warped from the original scan. <b>Edit points</b> opens the control-point editor:
    <ul>
      <li>Drag a numbered point on the scan or its pin on the map; the warped map updates live.</li>
      <li>The <b>Overlay</b> slider in the editor header sets the opacity of the warped map; press <b>T</b> to hide/show it quickly.</li>
      <li><b>+ Add point</b>: click the place on the scan, then the same place on the map. Good points: churches, castles, confluences, river mouths, old town centres.</li>
      <li>Each point shows its <b>leave-one-out error</b>: how far it would be predicted from all other points (green &lt; 10 km, yellow &lt; 25, orange &lt; 50, red ≥ 50). Red points are either misplaced or in a badly drawn part of the map; untick to test without deleting.</li>
      <li><b>Save</b> keeps the points in this browser and uses them for the offline copy. <b>Export .gcps.json</b> to make them permanent in the repository (then run <code>tools/warp_map.py</code>); <b>Export QGIS .points</b> / <b>Import</b> exchange points with the QGIS Georeferencer.</li>
    </ul></li>
  <li><b>Swipe</b> clips all historical layers to the left of the handle for before/after comparison.</li>
  <li><b>Digitise</b> barrow symbols, vanished villages, mills or earthworks. Barrow/earthwork symbols are stored undated (the map only proves they existed by then); buildings and villages take the map's period.</li>
</ul>

<h2>5b · Promising terrain (voids) and shape recognition</h2>
<p><b>Voids.</b> For the current view the app computes the exact distance from every point to the nearest settlement (Felzenszwalb–Huttenlocher distance transform on a ~250 m grid). The score peaks midway between settlements:</p>
<p><code>void = 1 − exp(−(d − d<sub>min</sub>) / D)</code>, 0 within d<sub>min</sub> of a settlement, × (0.25 + 0.75 × site potential) unless "distance only" is chosen.</p>
<ul>
  <li><b>Settlement sources:</b> modern settlements from OpenStreetMap (city, town, village, hamlet, suburb, isolated dwelling), loaded for the view plus a margin. Areas where settlements were never loaded stay blank, so missing data never reads as "empty land". Known archaeological sites can be added, which highlights unexplored gaps between known sites.</li>
  <li>OSM settlements are points: the <b>ignore within</b> distance stands in for the village's built-up area.</li>
</ul>
<p><b>Shape recognition.</b> Around the best voids (or any point via Inspect → <i>Scan imagery here</i>) the app reads 3×3 satellite tiles at zoom 17 (~0.8 m/px, ~600 m square) and looks for:</p>
<ul>
  <li><b>Circles</b> 8–40 m radius: gradient-directed Hough voting; kept only when ≥ 50 % of the circumference has an edge whose gradient points along the radius, the refined radius is in range, and the shape is round. Barrows, ring ditches, Trypillia house rings, pits.</li>
  <li><b>Rectangles</b> 15–150 m: Hough lines → parallel pairs → perpendicular pairs; all four sides need oriented edge support, and lines that continue far beyond the corners (field boundaries, roads) are penalised. Enclosures, foundations, earthworks.</li>
  <li>Both brightness (soil marks) and excess-green (crop marks) are analysed. Shapes with saturated or near-white colour (roofs, pools, concrete) are flagged <i>looks modern</i> and halved.</li>
</ul>
<p><b>Amplification:</b> each unrejected detection adds a Gaussian bump (σ 0.5 km) to the score: × (1 + 0.8 × Σ score), confirmed detections count double, modern-looking ones 0.3. Boosted areas show in pink. Confirmed detections become sites (source "Detected in imagery").</p>
<div class="callout">This is triage, not identification. Expect false positives (tree clumps, field corners, farm buildings, irrigation circles, bomb craters) and misses (features invisible in that image's season). Crop marks show best in dry summers; check historical imagery and the old maps before fieldwork. Tile imagery is used on demand for viewing and analysis in your browser; check the imagery provider's terms before large scans.</div>

<h2>6 · Adding a 30 m study area</h2>
<p>Add a line to <code>REGIONS</code> in <code>tools/dem_fetch.py</code> (west, south, east, north), then run <code>python3 tools/dem_fetch.py dem/ &lt;name&gt;_30m</code>, <code>python3 tools/terrain.py dem/ &lt;name&gt;_30m</code>, and add the two generated <code>data/*_&lt;name&gt;_30m.js</code> files to <code>index.html</code>. Study areas automatically replace the national grid inside their box.</p>

<h2 id="guide-limits">7 · Data and limitations</h2>
<ul>
  <li>DEM: Copernicus GLO-30 (© DLR e.V. 2010–2014, © Airbus Defence and Space GmbH 2014–2018, EU Copernicus). It is a surface model: forest canopy and buildings raise elevations; small earthworks are below its resolution. National grid is exported at ~600 m, study areas at ~60 m.</li>
  <li>Curated sites are a small starter set of well-known, published sites with approximate positions (± radius). They are not a register.</li>
  <li>Landscape zones are schematic.</li>
  <li>The potential model is rule-based and uncalibrated; the depth model uses broad rates. Both are planning aids for desk-based work, not substitutes for fieldwork.</li>
  <li>Kakhovka reservoir appears as land/water as of 2011–2015 (DEM age).</li>
  <li>Border, oblasts and cities: Natural Earth (public domain).</li>
</ul>
`;
};
