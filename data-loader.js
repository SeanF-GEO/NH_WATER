/**
 * data-loader.js — Load local GeoJSON datasets
 *
 * Actual file layout in /data/:
 *   State.geojson                         — NH state boundary
 *   nh_8.geojson                          — HUC8 watershed polygons
 *   trails_geojson/
 *     Trails_Ammonoosuc_River_Connecticut_River.geojson
 *     Trails_Ashuelot_River_Connecticut_River.geojson
 *     ... (16 files total, one per watershed region)
 */

const DataLoader = (() => {

  // All 16 trail files
  const TRAIL_FILES = [
    'Trails_Ammonoosuc_River_Connecticut_River.geojson',
    'Trails_Ashuelot_River_Connecticut_River.geojson',
    'Trails_Black_River_Connecticut_River.geojson',
    'Trails_Contoocook_River.geojson',
    'Trails_Headwaters_Connecticut_River.geojson',
    'Trails_Lower_Androscoggin_River.geojson',
    'Trails_Merrimack_River.geojson',
    'Trails_Millers_River.geojson',
    'Trails_Nashua_River.geojson',
    'Trails_Pemigewasset_River.geojson',
    'Trails_Piscataqua_Salmon_Falls.geojson',
    'Trails_Saco_River.geojson',
    'Trails_Upper_Androscoggin_River.geojson',
    'Trails_Waits_River_Connecticut_River.geojson',
    'Trails_West_River_Connecticut_River.geojson',
    'Trails_Winnipesaukee_River.geojson',
  ];

  /**
   * Fetch a single GeoJSON file. Returns parsed object or null on failure.
   */
  async function loadGeoJSON(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`Could not load ${path}:`, e.message);
      return null;
    }
  }

  /**
   * Load all 16 trail GeoJSONs and merge into a single FeatureCollection.
   * Each feature gets a `watershed` property derived from the filename.
   */
  async function loadAllTrails() {
    const promises = TRAIL_FILES.map(filename => {
      const path = `data/trails_geojson/${filename}`;
      return loadGeoJSON(path).then(geojson => {
        if (!geojson) return [];

        // "Trails_Saco_River.geojson" → "Saco River"
        const watershedName = filename
          .replace(/^Trails_/, '')
          .replace(/\.geojson$/, '')
          .replace(/_/g, ' ');

        const features = geojson.features || [];
        features.forEach(f => {
          f.properties = f.properties || {};
          f.properties.watershed = watershedName;
          if (!f.properties.name) {
            f.properties.name = f.properties.TRAIL_NAME
              || f.properties.Name
              || f.properties.NAME
              || f.properties.trail_name
              || `Trail (${watershedName})`;
          }
        });
        return features;
      });
    });

    const allArrays = await Promise.all(promises);
    const mergedFeatures = allArrays.flat();
    console.log(`Loaded ${mergedFeatures.length} trail features from ${TRAIL_FILES.length} files.`);

    return {
      type: 'FeatureCollection',
      features: mergedFeatures,
    };
  }

  /**
   * Load all base layers.
   * Returns { boundary, watersheds, trails }
   */
  async function loadAll() {
    const [boundary, watersheds, trails] = await Promise.all([
      loadGeoJSON('data/State.geojson'),
      loadGeoJSON('data/nh_8.geojson'),
      loadAllTrails(),
    ]);

    if (!boundary)   console.error('⚠ State.geojson failed to load');
    if (!watersheds) console.error('⚠ nh_8.geojson failed to load');
    if (!trails.features.length) console.warn('⚠ No trail features loaded');

    return {
      boundary:   boundary   || fallbackBoundary(),
      watersheds: watersheds || fallbackWatersheds(),
      trails:     trails,
    };
  }

  // ---- Minimal fallbacks (only if real files are missing) ---- //

  function fallbackBoundary() {
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: 'New Hampshire' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-72.55, 42.70], [-71.50, 42.70], [-70.70, 43.10],
            [-70.75, 43.60], [-70.98, 43.80], [-71.03, 44.25],
            [-71.08, 44.70], [-71.30, 44.95], [-71.50, 45.01],
            [-71.50, 45.30], [-72.00, 45.30], [-72.55, 45.00],
            [-72.55, 44.50], [-72.45, 44.10], [-72.40, 43.60],
            [-72.45, 43.20], [-72.55, 42.70]
          ]]
        }
      }]
    };
  }

  function fallbackWatersheds() {
    const features = [];
    const names = [
      'Upper Connecticut', 'Androscoggin', 'Saco',
      'Pemigewasset', 'Merrimack', 'Winnipesaukee',
      'Upper Merrimack', 'Contoocook', 'Souhegan',
      'Piscataquog', 'Lower Merrimack', 'Coastal'
    ];
    const rows = 4, cols = 3;
    const west = -72.55, east = -70.70, south = 42.70, north = 45.30;
    const dLng = (east - west) / cols;
    const dLat = (north - south) / rows;
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sw = [west + c * dLng, south + r * dLat];
        const ne = [west + (c + 1) * dLng, south + (r + 1) * dLat];
        features.push({
          type: 'Feature',
          properties: { huc8: `0108000${idx + 1}`, name: names[idx] || `Watershed ${idx + 1}` },
          geometry: {
            type: 'Polygon',
            coordinates: [[ [sw[0],sw[1]], [ne[0],sw[1]], [ne[0],ne[1]], [sw[0],ne[1]], [sw[0],sw[1]] ]]
          }
        });
        idx++;
      }
    }
    return { type: 'FeatureCollection', features };
  }

  return { loadAll };
})();
