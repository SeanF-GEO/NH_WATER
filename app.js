/**
 * app.js — Main application controller
 * NH Biodiversity Explorer
 *
 * Orchestrates: map init, data loading, user interactions,
 * API calls, spatial analysis, and layer updates.
 */

(async function () {
  'use strict';

  // ====== State ======
  let map;
  let baseLayers = {};          // { boundary, watersheds, trails }
  let observationsLayer = null; // L.geoJSON of observation points
  let heatmapLayer = null;      // L.heatLayer
  let legendControl = null;

  let rawData = {};             // { boundary, watersheds, trails } GeoJSON
  let currentSpecies = null;    // { id, name, commonName }
  let currentObservations = null;

  // DOM refs
  const $input      = document.getElementById('speciesInput');
  const $searchBtn  = document.getElementById('searchBtn');
  const $suggestions = document.getElementById('suggestions');
  const $activeSpecies = document.getElementById('activeSpecies');
  const $resultsPanel  = document.getElementById('resultsPanel');
  const $resultsContent = document.getElementById('resultsContent');
  const $loading     = document.getElementById('loadingOverlay');

  const $toggleINat  = document.getElementById('toggleINat');
  const $toggleEbird = document.getElementById('toggleEbird');
  const $toggleWS    = document.getElementById('toggleWatersheds');
  const $toggleTrails = document.getElementById('toggleTrails');
  const $toggleHeat  = document.getElementById('toggleHeatmap');
  const $togglePoints = document.getElementById('togglePoints');

  const $obsCount   = document.getElementById('obsCount');
  const $wsCount    = document.getElementById('watershedCount');
  const $trailCount = document.getElementById('trailCount');

  // ====== 1. Initialize Map ======
  function initMap() {
    map = L.map('map', {
      center: CONFIG.map.center,
      zoom: CONFIG.map.zoom,
      minZoom: CONFIG.map.minZoom,
      maxZoom: CONFIG.map.maxZoom,
      maxBounds: CONFIG.map.maxBounds,
      zoomControl: true,
    });

    // Dark base tile
    L.tileLayer(CONFIG.tiles.dark.url, {
      attribution: CONFIG.tiles.dark.attribution,
      maxZoom: 19,
    }).addTo(map);

    // Legend
    legendControl = MapStyles.createLegend();
    legendControl.addTo(map);
  }

  // ====== 2. Load GeoJSON Layers ======
  async function loadLayers() {
    rawData = await DataLoader.loadAll();

    // Boundary
    baseLayers.boundary = L.geoJSON(rawData.boundary, {
      style: MapStyles.boundaryStyle,
      interactive: false,
    }).addTo(map);

    // Watersheds
    baseLayers.watersheds = L.geoJSON(rawData.watersheds, {
      style: MapStyles.watershedDefaultStyle,
      onEachFeature: (feature, layer) => {
        layer.on({
          mouseover: (e) => {
            e.target.setStyle(MapStyles.watershedHighlightStyle());
            e.target.bringToFront();
          },
          mouseout: (e) => {
            baseLayers.watersheds.resetStyle(e.target);
          },
          click: () => {
            layer.bindPopup(MapStyles.watershedPopup(feature)).openPopup();
          },
        });
      },
    }).addTo(map);

    // Trails
    baseLayers.trails = L.geoJSON(rawData.trails, {
      style: MapStyles.trailDefaultStyle,
      onEachFeature: (feature, layer) => {
        layer.on('click', () => {
          layer.bindPopup(MapStyles.trailPopup(feature)).openPopup();
        });
      },
    }).addTo(map);
  }

  // ====== 3. Species Search ======
  let searchTimeout;

  function setupSearch() {
    $input.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      const q = $input.value.trim();
      if (q.length < 2) {
        $suggestions.classList.add('hidden');
        return;
      }
      searchTimeout = setTimeout(() => autocomplete(q), 300);
    });

    $input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = $suggestions.querySelector('.suggestion-item');
        if (first) first.click();
      }
    });

    $searchBtn.addEventListener('click', () => {
      const first = $suggestions.querySelector('.suggestion-item');
      if (first) first.click();
      else if ($input.value.trim().length >= 2) autocomplete($input.value.trim());
    });
  }

  async function autocomplete(query) {
    const taxa = await ApiClient.searchSpecies(query);
    if (!taxa.length) {
      $suggestions.innerHTML = '<div class="suggestion-item" style="color:var(--text-muted);">No species found</div>';
      $suggestions.classList.remove('hidden');
      return;
    }

    $suggestions.innerHTML = taxa.map(t => `
      <div class="suggestion-item"
           data-id="${t.id}"
           data-name="${t.name}"
           data-common="${t.commonName}">
        <span>${t.commonName}</span>
        <span class="sci-name">${t.name} · ${t.rank}</span>
      </div>
    `).join('');

    $suggestions.classList.remove('hidden');

    // Bind clicks
    $suggestions.querySelectorAll('.suggestion-item').forEach(el => {
      el.addEventListener('click', () => {
        selectSpecies({
          id: el.dataset.id,
          name: el.dataset.name,
          commonName: el.dataset.common,
        });
      });
    });
  }

  // ====== 4. Select Species & Fetch Observations ======
  async function selectSpecies(species) {
    currentSpecies = species;
    $suggestions.classList.add('hidden');
    $input.value = '';

    // Show active tag
    $activeSpecies.innerHTML = `
      <span>
        <span class="species-name">${species.commonName}</span>
        <span class="sci-name" style="color:var(--text-muted);font-size:0.72rem;margin-left:4px;">
          ${species.name}
        </span>
      </span>
      <button class="clear-btn" title="Clear">&times;</button>
    `;
    $activeSpecies.classList.remove('hidden');
    $activeSpecies.querySelector('.clear-btn').addEventListener('click', clearSpecies);

    // Fetch
    showLoading('Fetching observations...');
    try {
      currentObservations = await ApiClient.fetchAllObservations(
        species.id,
        species.name,
        $toggleINat.checked,
        $toggleEbird.checked,
      );
      runAnalysis();
    } catch (e) {
      console.error('Fetch failed:', e);
      hideLoading();
    }
  }

  function clearSpecies() {
    currentSpecies = null;
    currentObservations = null;
    $activeSpecies.classList.add('hidden');
    clearObservationLayers();
    resetLayerStyles();
    updateStats(0, 0, 0);
    $resultsPanel.style.display = 'none';
  }

  // ====== 5. Spatial Analysis & Rendering ======
  function runAnalysis() {
    if (!currentObservations || !currentObservations.features.length) {
      hideLoading();
      clearObservationLayers();
      resetLayerStyles();
      updateStats(0, 0, 0);
      $resultsPanel.style.display = 'none';
      alert('No observations found for this species in New Hampshire.');
      return;
    }

    showLoading('Running spatial analysis...');

    // Small delay so the UI updates
    setTimeout(() => {
      // 5a. Aggregate observations by watershed
      SpatialAnalysis.aggregateByWatershed(rawData.watersheds, currentObservations);

      // 5b. Score trails
      SpatialAnalysis.scoreTrails(rawData.trails, currentObservations, CONFIG.analysis.trailBufferMeters);

      // 5c. Update map layers
      updateWatershedChoropleth();
      updateTrailScores();
      updateObservationPoints();
      updateHeatmap();

      // 5d. Show results
      showResults();
      updateStats(
        currentObservations.features.length,
        SpatialAnalysis.rankWatersheds(rawData.watersheds).length,
        SpatialAnalysis.rankTrails(rawData.trails).length,
      );

      hideLoading();
    }, 50);
  }

  function updateWatershedChoropleth() {
    if (baseLayers.watersheds) {
      baseLayers.watersheds.clearLayers();
    }
    baseLayers.watersheds = L.geoJSON(rawData.watersheds, {
      style: MapStyles.watershedChoroplethStyle,
      onEachFeature: (feature, layer) => {
        layer.on({
          mouseover: (e) => {
            e.target.setStyle(MapStyles.watershedHighlightStyle());
            e.target.bringToFront();
          },
          mouseout: (e) => {
            baseLayers.watersheds.resetStyle(e.target);
          },
          click: () => {
            layer.bindPopup(MapStyles.watershedPopup(feature)).openPopup();
          },
        });
      },
    });

    if ($toggleWS.checked) baseLayers.watersheds.addTo(map);
  }

  function updateTrailScores() {
    if (baseLayers.trails) {
      baseLayers.trails.clearLayers();
    }
    baseLayers.trails = L.geoJSON(rawData.trails, {
      style: MapStyles.trailScoredStyle,
      onEachFeature: (feature, layer) => {
        layer.on('click', () => {
          layer.bindPopup(MapStyles.trailPopup(feature)).openPopup();
        });
      },
    });

    if ($toggleTrails.checked) baseLayers.trails.addTo(map);
  }

  function updateObservationPoints() {
    if (observationsLayer) {
      map.removeLayer(observationsLayer);
    }
    observationsLayer = L.geoJSON(currentObservations, {
      pointToLayer: MapStyles.observationMarker,
      onEachFeature: (feature, layer) => {
        layer.bindPopup(MapStyles.observationPopup(feature));
      },
    });

    if ($togglePoints.checked) observationsLayer.addTo(map);
  }

  function updateHeatmap() {
    if (heatmapLayer) {
      map.removeLayer(heatmapLayer);
    }
    const heatPoints = currentObservations.features.map(f => [
      f.geometry.coordinates[1],
      f.geometry.coordinates[0],
      0.6,
    ]);
    heatmapLayer = L.heatLayer(heatPoints, {
      radius: 20,
      blur: 15,
      maxZoom: 14,
      gradient: {
        0.2: '#2a3323',
        0.4: '#6b8e23',
        0.6: '#9acd32',
        0.8: '#f0b429',
        1.0: '#e85d5d',
      },
    });

    if ($toggleHeat.checked) heatmapLayer.addTo(map);
  }

  function clearObservationLayers() {
    if (observationsLayer) { map.removeLayer(observationsLayer); observationsLayer = null; }
    if (heatmapLayer)      { map.removeLayer(heatmapLayer); heatmapLayer = null; }
  }

  function resetLayerStyles() {
    if (baseLayers.watersheds) {
      baseLayers.watersheds.clearLayers();
      baseLayers.watersheds = L.geoJSON(rawData.watersheds, {
        style: MapStyles.watershedDefaultStyle,
        onEachFeature: (feature, layer) => {
          layer.on({
            mouseover: (e) => { e.target.setStyle(MapStyles.watershedHighlightStyle()); e.target.bringToFront(); },
            mouseout: (e) => { baseLayers.watersheds.resetStyle(e.target); },
          });
        },
      });
      if ($toggleWS.checked) baseLayers.watersheds.addTo(map);
    }

    if (baseLayers.trails) {
      baseLayers.trails.clearLayers();
      baseLayers.trails = L.geoJSON(rawData.trails, {
        style: MapStyles.trailDefaultStyle,
        onEachFeature: (feature, layer) => {
          layer.on('click', () => { layer.bindPopup(MapStyles.trailPopup(feature)).openPopup(); });
        },
      });
      if ($toggleTrails.checked) baseLayers.trails.addTo(map);
    }
  }

  // ====== 6. Results Panel ======
  function showResults() {
    const topWS = SpatialAnalysis.rankWatersheds(rawData.watersheds).slice(0, 5);
    const topTrails = SpatialAnalysis.rankTrails(rawData.trails).slice(0, 5);
    const maxWS = topWS.length ? topWS[0].properties.obsCount : 1;
    const maxTrail = topTrails.length ? topTrails[0].properties.obsNearby : 1;

    let html = '';

    // Top watersheds
    html += '<div class="results-section"><h4>Top Watersheds</h4>';
    if (topWS.length) {
      topWS.forEach(ws => {
        const pct = (ws.properties.obsCount / maxWS * 100).toFixed(0);
        html += `
          <div class="result-row">
            <span class="name">${ws.properties.name || ws.properties.huc8}</span>
            <span class="value">${ws.properties.obsCount}</span>
          </div>
          <div class="density-bar">
            <div class="density-bar-fill" style="width:${pct}%;background:${SpatialAnalysis.getDensityColor(ws.properties.obsCount)};"></div>
          </div>`;
      });
    } else {
      html += '<div style="color:var(--text-muted);font-size:0.78rem;">No observations in watersheds</div>';
    }
    html += '</div>';

    // Top trails
    html += '<div class="results-section"><h4>Best Trails for Sightings</h4>';
    if (topTrails.length) {
      topTrails.forEach(t => {
        const pct = (t.properties.obsNearby / maxTrail * 100).toFixed(0);
        html += `
          <div class="result-row">
            <span class="name">${t.properties.name || 'Trail'}</span>
            <span class="value trail-hot">${t.properties.obsNearby}</span>
          </div>
          <div class="density-bar">
            <div class="density-bar-fill" style="width:${pct}%;background:#f0b429;"></div>
          </div>`;
      });
    } else {
      html += '<div style="color:var(--text-muted);font-size:0.78rem;">No observations near trails</div>';
    }
    html += '</div>';

    $resultsContent.innerHTML = html;
    $resultsPanel.style.display = 'block';
  }

  function updateStats(obs, ws, trails) {
    $obsCount.textContent = obs.toLocaleString();
    $wsCount.textContent = ws;
    $trailCount.textContent = trails;
  }

  // ====== 7. Layer Toggle Handlers ======
  function setupToggles() {
    $toggleWS.addEventListener('change', () => {
      if ($toggleWS.checked) baseLayers.watersheds?.addTo(map);
      else map.removeLayer(baseLayers.watersheds);
    });

    $toggleTrails.addEventListener('change', () => {
      if ($toggleTrails.checked) baseLayers.trails?.addTo(map);
      else map.removeLayer(baseLayers.trails);
    });

    $togglePoints.addEventListener('change', () => {
      if (!observationsLayer) return;
      if ($togglePoints.checked) observationsLayer.addTo(map);
      else map.removeLayer(observationsLayer);
    });

    $toggleHeat.addEventListener('change', () => {
      if (!heatmapLayer) return;
      if ($toggleHeat.checked) heatmapLayer.addTo(map);
      else map.removeLayer(heatmapLayer);
    });

    // Re-fetch when data sources toggled while a species is active
    $toggleINat.addEventListener('change', () => { if (currentSpecies) selectSpecies(currentSpecies); });
    $toggleEbird.addEventListener('change', () => { if (currentSpecies) selectSpecies(currentSpecies); });
  }

  // ====== Loading Helpers ======
  function showLoading(msg) {
    $loading.querySelector('.loading-text').textContent = msg || 'Loading...';
    $loading.classList.remove('hidden');
  }
  function hideLoading() {
    $loading.classList.add('hidden');
  }

  // ====== Boot ======
  initMap();
  await loadLayers();
  setupSearch();
  setupToggles();

  console.log('🌿 NH Biodiversity Explorer ready.');
})();
