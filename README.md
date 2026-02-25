# NH Biodiversity Explorer

An interactive web map for exploring biodiversity observations across New Hampshire, powered by **Leaflet.js**, **Turf.js**, and real-time data from **iNaturalist** and **eBird** APIs.

Designed as a static site for **GitHub Pages** — no backend required.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                    Browser (Client)                   │
│                                                      │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Leaflet  │  │ Turf.js  │  │  Application JS   │   │
│  │  Map     │  │ Spatial  │  │  (app.js +         │   │
│  │  Engine  │  │ Analysis │  │   api-client.js)   │   │
│  └────┬─────┘  └────┬─────┘  └────────┬──────────┘   │
│       │              │                 │              │
│       └──────────────┴────────┬────────┘              │
│                               │                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Local GeoJSON Data                   │ │
│  │  nh-boundary · watersheds · trails               │ │
│  └─────────────────────────────────────────────────┘ │
└───────────────────────────┬──────────────────────────┘
                            │ HTTPS fetch
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        ┌──────────┐ ┌──────────┐ ┌────────────┐
        │ CARTO    │ │iNaturalist│ │  eBird     │
        │ Tiles    │ │  API      │ │  API       │
        └──────────┘ └──────────┘ └────────────┘
```

### Data Flow

1. **Map initializes** with CARTO dark tiles and loads local GeoJSON layers
2. **User searches** a species → iNaturalist taxa autocomplete API
3. **User selects** a species → parallel fetch from iNaturalist + eBird
4. **Spatial analysis** runs client-side with Turf.js:
   - Point-in-polygon: assign each observation to a watershed
   - Density calculation: observations / area per watershed
   - Trail scoring: count observations within 100m buffer of each trail
5. **Map updates** dynamically: choropleth watersheds, scored trails, point markers, heatmap

---

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Map engine | Leaflet.js 1.9 | Interactive slippy map |
| Spatial analysis | Turf.js 6 | Point-in-polygon, buffering, distance |
| Heatmap | Leaflet.heat | Observation density heatmap |
| Base tiles | CARTO Dark | Aesthetic dark base map |
| Data format | GeoJSON | All vector data |
| APIs | iNaturalist, eBird | Species occurrence data |
| Hosting | GitHub Pages | Free static hosting |

---

## Folder Structure

```
nh-biodiversity-map/
├── index.html                  # Main application entry point
├── css/
│   └── style.css               # All styles (dark organic theme)
├── js/
│   ├── config.js               # Constants, API endpoints, breakpoints
│   ├── data-loader.js          # GeoJSON loading + placeholder generation
│   ├── api-client.js           # iNaturalist & eBird API integration
│   ├── spatial-analysis.js     # Turf.js analysis functions
│   ├── map-styles.js           # Leaflet styling, popups, legend
│   └── app.js                  # Main controller / orchestrator
├── data/
│   ├── nh-boundary.geojson     # NH state outline
│   ├── watersheds-huc8.geojson # HUC8 watershed polygons
│   ├── watersheds-huc10.geojson# HUC10 (optional, finer detail)
│   └── trails.geojson          # NH trail network
├── lib/                        # (Optional) vendored libraries
└── README.md
```

---

## API Integration Reference

### iNaturalist API (no key required)

**Taxa autocomplete** — species search:
```
GET https://api.inaturalist.org/v1/taxa/autocomplete?q=black+bear&per_page=10
```

**Observations** — fetch within NH bounding box:
```
GET https://api.inaturalist.org/v1/observations
  ?taxon_id=41688
  &swlat=42.697&swlng=-72.557
  &nelat=45.305&nelng=-70.703
  &quality_grade=research,needs_id
  &per_page=200
  &page=1
  &order=desc&order_by=observed_on
```

Response shape (simplified):
```json
{
  "results": [
    {
      "id": 12345,
      "observed_on": "2024-06-15",
      "geojson": { "type": "Point", "coordinates": [-71.5, 43.9] },
      "taxon": {
        "name": "Ursus americanus",
        "preferred_common_name": "American Black Bear"
      },
      "user": { "login": "naturalist42" },
      "photos": [{ "url": "https://..." }],
      "uri": "https://www.inaturalist.org/observations/12345"
    }
  ]
}
```

### eBird API (key required)

Get an API key: https://ebird.org/api/keygen

**Recent observations** by species in NH:
```
GET https://api.ebird.org/v2/data/obs/US-NH/recent/baleag?back=30
Header: X-eBirdApiToken: YOUR_KEY
```

Response shape:
```json
[
  {
    "speciesCode": "baleag",
    "comName": "Bald Eagle",
    "sciName": "Haliaeetus leucocephalus",
    "locName": "Lake Winnipesaukee",
    "lat": 43.57,
    "lng": -71.31,
    "obsDt": "2024-08-01 07:30",
    "howMany": 2,
    "subId": "S123456789"
  }
]
```

---

## Spatial Analysis Examples (Turf.js)

### Point-in-Polygon — Assign observations to watersheds

```javascript
const point = turf.point([-71.5, 43.9]);
const polygon = turf.polygon([[
  [-72.0, 43.5], [-71.0, 43.5], [-71.0, 44.0],
  [-72.0, 44.0], [-72.0, 43.5]
]]);

const inside = turf.booleanPointInPolygon(point, polygon);
// true
```

### Observation density per watershed

```javascript
observations.forEach(obs => {
  const pt = turf.point(obs.geometry.coordinates);
  watersheds.features.forEach(ws => {
    if (turf.booleanPointInPolygon(pt, ws)) {
      ws.properties.obsCount = (ws.properties.obsCount || 0) + 1;
    }
  });
});

// Calculate per-km² density
watersheds.features.forEach(ws => {
  const areaKm2 = turf.area(ws) / 1e6;
  ws.properties.density = ws.properties.obsCount / areaKm2;
});
```

### Trail scoring — Buffer analysis

```javascript
const bufferKm = 0.1; // 100 meters

observations.forEach(obs => {
  const pt = turf.point(obs.geometry.coordinates);
  trails.features.forEach(trail => {
    const nearest = turf.nearestPointOnLine(trail, pt);
    if (nearest.properties.dist <= bufferKm) {
      trail.properties.obsNearby = (trail.properties.obsNearby || 0) + 1;
    }
  });
});

// Normalize to 0–1
const max = Math.max(...trails.features.map(t => t.properties.obsNearby));
trails.features.forEach(t => {
  t.properties.scoreNorm = t.properties.obsNearby / max;
});
```

### Nearest trail to an observation

```javascript
function findNearestTrail(obsPoint, trails) {
  let nearest = null;
  let minDist = Infinity;

  trails.features.forEach(trail => {
    const snapped = turf.nearestPointOnLine(trail, obsPoint);
    if (snapped.properties.dist < minDist) {
      minDist = snapped.properties.dist;
      nearest = trail;
    }
  });

  return { trail: nearest, distanceKm: minDist };
}
```

---

## Deploying to GitHub Pages

### Step-by-step

1. **Create a GitHub repository**
   ```bash
   git init nh-biodiversity-map
   cd nh-biodiversity-map
   ```

2. **Add your real GeoJSON data** to the `data/` directory:
   - Download NH boundary from US Census TIGER/Line or Natural Earth
   - Download HUC8 watersheds from USGS NHD (National Hydrography Dataset)
   - Download trail data from NH GRANIT or OpenStreetMap

3. **Set your eBird API key** in `js/config.js`:
   ```javascript
   apiKey: 'YOUR_EBIRD_API_KEY_HERE',
   ```

4. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial NH Biodiversity Explorer"
   git remote add origin https://github.com/YOUR_USER/nh-biodiversity-map.git
   git push -u origin main
   ```

5. **Enable GitHub Pages**
   - Go to Settings → Pages
   - Source: Deploy from a branch
   - Branch: `main` / `/ (root)`
   - Save — your site will be live at `https://YOUR_USER.github.io/nh-biodiversity-map/`

### Data Sources for Real GeoJSON

| Layer | Source | URL |
|-------|--------|-----|
| NH Boundary | US Census TIGER | https://www.census.gov/cgi-bin/geo/shapefiles/ |
| HUC8 Watersheds | USGS NHD | https://www.usgs.gov/national-hydrography/access-national-hydrography-products |
| HUC10 Watersheds | USGS NHD | Same as above |
| Trail Network | NH GRANIT | https://granit.unh.edu/ |
| Trail Network | OpenStreetMap | Overpass API query for NH trails |

Convert Shapefiles to GeoJSON using `ogr2ogr`:
```bash
ogr2ogr -f GeoJSON nh-boundary.geojson tl_2023_33_state.shp
ogr2ogr -f GeoJSON watersheds-huc8.geojson wbdhu8_nh.shp
```

---

## Scaling & Future Expansion

### Adding new states

The architecture supports multi-state expansion:

1. Add state-specific config objects in `config.js` (bounds, center, zoom)
2. Add GeoJSON files per state under `data/{state-code}/`
3. Add a state selector dropdown to the UI
4. Parameterize API queries by state bounding box

### Additional datasets

The modular layer system makes it simple to add:
- **Protected areas** (PADUS): another polygon layer with its own toggle
- **Elevation / terrain**: raster tile overlay (e.g., Mapbox terrain)
- **Water bodies**: lakes/rivers GeoJSON from NHD
- **Land cover**: NLCD raster tiles

### User-contributed observations

Options for community data:
- **Google Sheets** as a simple backend (fetch published CSV)
- **Supabase / Firebase** for a lightweight real database
- **GitHub Issues** as a contribution pipeline (parse with Actions)

### Performance at scale

For large observation sets (10,000+):
- Use **Web Workers** for spatial analysis off the main thread
- Use **Leaflet.markercluster** for point clustering
- Pre-compute watershed aggregations server-side
- Use **vector tiles** (PMTiles) instead of raw GeoJSON for large geometries

---

## License

MIT — use freely, attribute kindly.
