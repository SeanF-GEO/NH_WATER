/**
 * config.js — Application configuration
 * NH Biodiversity Explorer
 */
const CONFIG = {
  // Map defaults
  map: {
    center: [43.95, -71.5],
    zoom: 8,
    minZoom: 7,
    maxZoom: 18,
    maxBounds: [[42.5, -73.0], [45.5, -70.0]],
  },

  // Tile layers
  tiles: {
    // Dark carto for the organic aesthetic
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
    },
    // Topo alternative
    topo: {
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    },
  },

  // NH bounding box for API queries
  nhBounds: {
    swlat: 42.697,
    swlng: -72.557,
    nelat: 45.305,
    nelng: -70.703,
  },

  // API endpoints
  api: {
    iNaturalist: {
      baseUrl: 'https://api.inaturalist.org/v1',
      observationsEndpoint: '/observations',
      taxaEndpoint: '/taxa/autocomplete',
      perPage: 200,
      maxPages: 5, // max 1000 obs per query
    },
    eBird: {
      baseUrl: 'https://api.ebird.org/v2',
      // eBird API requires an API key — users must supply their own
      // Get one at: https://ebird.org/api/keygen
      apiKey: '', // SET YOUR EBIRD API KEY HERE
      recentObsEndpoint: '/data/obs/US-NH/recent',
    },
  },

  // Spatial analysis
  analysis: {
    trailBufferMeters: 100, // buffer distance for trail scoring
    densityBreaks: [0, 1, 5, 15, 40, 100], // choropleth breakpoints
  },

  // Colors for density choropleth
  densityColors: [
    '#2a3323', // 0
    '#3d5a1e', // 1-4
    '#6b8e23', // 5-14
    '#9acd32', // 15-39
    '#f0b429', // 40-99
    '#e85d5d', // 100+
  ],

  // Trail score colors (low → high)
  trailScoreColors: [
    '#3a4a2e', // 0
    '#5a7a3e', // low
    '#8ebc50', // medium
    '#f0b429', // high
    '#e85d5d', // very high
  ],
};
