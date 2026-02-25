/**
 * data-loader.js — Load local GeoJSON datasets
 *
 * Expected files in /data/:
 *   nh-boundary.geojson
 *   watersheds-huc8.geojson
 *   watersheds-huc10.geojson  (optional)
 *   trails.geojson
 *
 * For the prototype we generate simplified placeholder geometry
 * so the app runs without real data files. Replace with your actual
 * GeoJSON when available.
 */

const DataLoader = (() => {

  /**
   * Attempt to fetch a GeoJSON file; if missing, return a placeholder.
   */
  async function loadGeoJSON(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`Could not load ${path} — using placeholder data.`);
      return null;
    }
  }

  /**
   * Load all base layers. Returns { boundary, watersheds, trails }.
   */
  async function loadAll() {
    const [boundary, watersheds, trails] = await Promise.all([
      loadGeoJSON('data/nh-boundary.geojson'),
      loadGeoJSON('data/watersheds-huc8.geojson'),
      loadGeoJSON('data/trails.geojson'),
    ]);

    return {
      boundary:   boundary   || generatePlaceholderBoundary(),
      watersheds: watersheds || generatePlaceholderWatersheds(),
      trails:     trails     || generatePlaceholderTrails(),
    };
  }

  // ---- Placeholder generators (simplified geometry for demo) ---- //

  function generatePlaceholderBoundary() {
    // Simplified NH outline
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

  function generatePlaceholderWatersheds() {
    // Generate a grid of ~12 watershed polygons covering NH
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
          properties: {
            huc8: `0108000${idx + 1}`,
            name: names[idx] || `Watershed ${idx + 1}`,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [sw[0], sw[1]],
              [ne[0], sw[1]],
              [ne[0], ne[1]],
              [sw[0], ne[1]],
              [sw[0], sw[1]],
            ]]
          }
        });
        idx++;
      }
    }
    return { type: 'FeatureCollection', features };
  }

  function generatePlaceholderTrails() {
    // A few representative trail lines
    const trails = [
      {
        name: 'Appalachian Trail — NH Section',
        coords: [
          [-72.10, 43.50], [-71.90, 43.80], [-71.70, 44.10],
          [-71.68, 44.27], [-71.30, 44.50], [-71.30, 44.90]
        ]
      },
      {
        name: 'Franconia Ridge Trail',
        coords: [[-71.65, 44.12], [-71.63, 44.16], [-71.60, 44.18]]
      },
      {
        name: 'Presidential Range Trail',
        coords: [[-71.35, 44.25], [-71.30, 44.28], [-71.28, 44.30], [-71.25, 44.27]]
      },
      {
        name: 'Monadnock Trail',
        coords: [[-72.11, 42.86], [-72.10, 42.87], [-72.09, 42.86]]
      },
      {
        name: 'Wapack Trail',
        coords: [[-71.90, 42.82], [-71.88, 42.90], [-71.86, 42.96]]
      },
      {
        name: 'Cohos Trail',
        coords: [[-71.40, 44.60], [-71.38, 44.80], [-71.30, 45.00], [-71.35, 45.20]]
      },
    ];

    return {
      type: 'FeatureCollection',
      features: trails.map((t, i) => ({
        type: 'Feature',
        properties: { name: t.name, id: `trail_${i}` },
        geometry: {
          type: 'LineString',
          coordinates: t.coords,
        }
      }))
    };
  }

  return { loadAll };
})();
