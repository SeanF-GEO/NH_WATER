/**
 * spatial-analysis.js — Turf.js powered spatial analysis
 *
 * Functions:
 *  - aggregateByWatershed:  point-in-polygon counts
 *  - calculateDensity:      observation density per watershed (obs / km²)
 *  - scoreTrails:           count observations within buffer of each trail
 *  - classifyDensity:       assign color class based on count breakpoints
 */

const SpatialAnalysis = (() => {

  /**
   * Count observations falling inside each watershed polygon.
   * Mutates watershed feature properties:
   *   .obsCount   — number of observations inside
   *   .obsDensity — observations per km²
   *
   * @param {FeatureCollection} watersheds  — polygon features
   * @param {FeatureCollection} observations — point features
   * @returns {FeatureCollection} watersheds with updated properties
   */
  function aggregateByWatershed(watersheds, observations) {
    const points = observations.features;

    // Reset counts
    watersheds.features.forEach(ws => {
      ws.properties.obsCount = 0;
      ws.properties.obsDensity = 0;
    });

    // Point-in-polygon for every observation
    points.forEach(pt => {
      const coord = pt.geometry.coordinates;
      const turfPt = turf.point(coord);

      for (const ws of watersheds.features) {
        try {
          if (turf.booleanPointInPolygon(turfPt, ws)) {
            ws.properties.obsCount++;
            break; // each point in at most one watershed
          }
        } catch (e) {
          // skip malformed geometries
        }
      }
    });

    // Calculate area-based density
    watersheds.features.forEach(ws => {
      try {
        const areaKm2 = turf.area(ws) / 1e6; // m² → km²
        ws.properties.obsDensity = areaKm2 > 0
          ? +(ws.properties.obsCount / areaKm2).toFixed(2)
          : 0;
      } catch (e) {
        ws.properties.obsDensity = 0;
      }
    });

    return watersheds;
  }

  /**
   * Classify an observation count into a density tier index (0–5).
   * Uses CONFIG.analysis.densityBreaks.
   */
  function classifyDensity(count) {
    const breaks = CONFIG.analysis.densityBreaks;
    for (let i = breaks.length - 1; i >= 0; i--) {
      if (count >= breaks[i]) return i;
    }
    return 0;
  }

  /**
   * Get the choropleth color for a given observation count.
   */
  function getDensityColor(count) {
    return CONFIG.densityColors[classifyDensity(count)];
  }

  /**
   * Score each trail by counting observations within a buffer distance.
   * Mutates trail feature properties:
   *   .obsNearby   — count of observations within buffer
   *   .scoreNorm   — normalized 0-1 score (relative to max)
   *
   * Uses simplified approach: for each observation, check distance to
   * nearest point on each trail. This is O(trails × observations).
   *
   * @param {FeatureCollection} trails       — LineString features
   * @param {FeatureCollection} observations — Point features
   * @param {number}            bufferMeters — buffer radius (default 100)
   * @returns {FeatureCollection} trails with scores
   */
  function scoreTrails(trails, observations, bufferMeters) {
    const bufferKm = (bufferMeters || CONFIG.analysis.trailBufferMeters) / 1000;
    const points = observations.features;

    // Reset
    trails.features.forEach(t => {
      t.properties.obsNearby = 0;
      t.properties.scoreNorm = 0;
    });

    // For each observation, find trails within buffer
    points.forEach(pt => {
      const coord = pt.geometry.coordinates;
      const turfPt = turf.point(coord);

      trails.features.forEach(trail => {
        try {
          const nearestPt = turf.nearestPointOnLine(trail, turfPt);
          const distKm = nearestPt.properties.dist; // km
          if (distKm <= bufferKm) {
            trail.properties.obsNearby++;
          }
        } catch (e) {
          // skip
        }
      });
    });

    // Normalize scores
    const maxObs = Math.max(1, ...trails.features.map(t => t.properties.obsNearby));
    trails.features.forEach(t => {
      t.properties.scoreNorm = +(t.properties.obsNearby / maxObs).toFixed(3);
    });

    return trails;
  }

  /**
   * Get trail color based on normalized score (0–1).
   */
  function getTrailColor(scoreNorm) {
    const colors = CONFIG.trailScoreColors;
    if (scoreNorm <= 0)    return colors[0];
    if (scoreNorm < 0.25)  return colors[1];
    if (scoreNorm < 0.5)   return colors[2];
    if (scoreNorm < 0.75)  return colors[3];
    return colors[4];
  }

  /**
   * Get trail weight based on normalized score.
   */
  function getTrailWeight(scoreNorm) {
    return 2 + scoreNorm * 4; // 2px to 6px
  }

  /**
   * Get ranked list of watersheds by observation count (descending).
   */
  function rankWatersheds(watersheds) {
    return [...watersheds.features]
      .filter(f => f.properties.obsCount > 0)
      .sort((a, b) => b.properties.obsCount - a.properties.obsCount);
  }

  /**
   * Get ranked list of trails by score (descending).
   */
  function rankTrails(trails) {
    return [...trails.features]
      .filter(f => f.properties.obsNearby > 0)
      .sort((a, b) => b.properties.obsNearby - a.properties.obsNearby);
  }

  return {
    aggregateByWatershed,
    classifyDensity,
    getDensityColor,
    scoreTrails,
    getTrailColor,
    getTrailWeight,
    rankWatersheds,
    rankTrails,
  };
})();
