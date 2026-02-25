/**
 * map-styles.js — Leaflet style functions, popups, and marker factories
 */

const MapStyles = (() => {

  /**
   * Style for the NH state boundary outline.
   */
  function boundaryStyle() {
    return {
      color: '#7ecf5a',
      weight: 2,
      opacity: 0.6,
      fillColor: 'transparent',
      fillOpacity: 0,
      dashArray: '6,4',
    };
  }

  /**
   * Default watershed style (before observations loaded).
   */
  function watershedDefaultStyle() {
    return {
      color: '#3a4a2e',
      weight: 1,
      opacity: 0.5,
      fillColor: '#2a3323',
      fillOpacity: 0.3,
    };
  }

  /**
   * Watershed style based on observation count (choropleth).
   */
  function watershedChoroplethStyle(feature) {
    const count = feature.properties.obsCount || 0;
    return {
      color: '#4a5e38',
      weight: 1,
      opacity: 0.7,
      fillColor: SpatialAnalysis.getDensityColor(count),
      fillOpacity: 0.55,
    };
  }

  /**
   * Watershed hover highlight.
   */
  function watershedHighlightStyle() {
    return {
      weight: 2,
      color: '#7ecf5a',
      fillOpacity: 0.7,
    };
  }

  /**
   * Default trail style.
   */
  function trailDefaultStyle() {
    return {
      color: '#5a7a3e',
      weight: 2,
      opacity: 0.5,
    };
  }

  /**
   * Trail style based on score.
   */
  function trailScoredStyle(feature) {
    const score = feature.properties.scoreNorm || 0;
    return {
      color: SpatialAnalysis.getTrailColor(score),
      weight: SpatialAnalysis.getTrailWeight(score),
      opacity: 0.4 + score * 0.6,
    };
  }

  /**
   * Create a circle marker for an observation point.
   */
  function observationMarker(feature, latlng) {
    const isINat = feature.properties.source === 'iNaturalist';
    return L.circleMarker(latlng, {
      radius: 5,
      fillColor: isINat ? '#74ac00' : '#3d85c6',
      color: '#1a1f16',
      weight: 1,
      fillOpacity: 0.8,
    });
  }

  /**
   * Popup content for an observation point.
   */
  function observationPopup(feature) {
    const p = feature.properties;
    const photo = p.photoUrl
      ? `<img src="${p.photoUrl}" style="width:100%;max-height:120px;object-fit:cover;border-radius:4px;margin-bottom:6px;" />`
      : '';
    return `
      ${photo}
      <strong>${p.commonName || p.species}</strong><br/>
      <em style="color:#a3b48e;font-size:0.75rem;">${p.species}</em><br/>
      <span style="color:#6e7f5e;font-size:0.72rem;">
        ${p.source} · ${p.observedOn || 'date unknown'}
        ${p.observer ? ` · ${p.observer}` : ''}
        ${p.locationName ? `<br/>${p.locationName}` : ''}
      </span><br/>
      <a href="${p.uri}" target="_blank" rel="noopener" style="font-size:0.75rem;">
        View observation →
      </a>
    `;
  }

  /**
   * Popup content for a watershed polygon.
   */
  function watershedPopup(feature) {
    const p = feature.properties;
    return `
      <strong>${p.name || p.huc8 || 'Watershed'}</strong><br/>
      <span style="color:#a3b48e;">
        Observations: <b style="color:#7ecf5a;">${p.obsCount || 0}</b><br/>
        Density: ${p.obsDensity || 0} / km²
      </span>
    `;
  }

  /**
   * Popup content for a trail.
   */
  function trailPopup(feature) {
    const p = feature.properties;
    const score = p.scoreNorm || 0;
    const stars = score > 0.75 ? '★★★' : score > 0.5 ? '★★' : score > 0.25 ? '★' : '—';
    return `
      <strong>${p.name || 'Trail'}</strong><br/>
      <span style="color:#a3b48e;">
        Nearby observations: <b style="color:#f0b429;">${p.obsNearby || 0}</b><br/>
        Sighting likelihood: ${stars}
      </span>
    `;
  }

  /**
   * Create a density legend control.
   */
  function createLegend() {
    const legend = L.control({ position: 'bottomright' });
    legend.onAdd = function () {
      const div = L.DomUtil.create('div', 'legend');
      const breaks = CONFIG.analysis.densityBreaks;
      const colors = CONFIG.densityColors;

      let html = '<div class="legend-title">Observation Density</div>';
      for (let i = 0; i < breaks.length; i++) {
        const label = i < breaks.length - 1
          ? `${breaks[i]}–${breaks[i + 1] - 1}`
          : `${breaks[i]}+`;
        html += `
          <div class="legend-row">
            <span class="legend-swatch" style="background:${colors[i]};"></span>
            ${label}
          </div>`;
      }

      html += '<div class="legend-title" style="margin-top:8px;">Trail Score</div>';
      html += '<div class="legend-row"><span class="legend-swatch" style="background:#5a7a3e;"></span> Low</div>';
      html += '<div class="legend-row"><span class="legend-swatch" style="background:#f0b429;"></span> High</div>';
      html += '<div class="legend-row"><span class="legend-swatch" style="background:#e85d5d;"></span> Very High</div>';

      div.innerHTML = html;
      return div;
    };
    return legend;
  }

  return {
    boundaryStyle,
    watershedDefaultStyle,
    watershedChoroplethStyle,
    watershedHighlightStyle,
    trailDefaultStyle,
    trailScoredStyle,
    observationMarker,
    observationPopup,
    watershedPopup,
    trailPopup,
    createLegend,
  };
})();
