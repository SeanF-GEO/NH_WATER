/**
 * api-client.js — Fetch observations from iNaturalist and eBird
 *
 * iNaturalist: free, no key needed
 * eBird:       requires API key from https://ebird.org/api/keygen
 */

const ApiClient = (() => {

  // ========================================================
  //  iNaturalist
  // ========================================================

  /**
   * Autocomplete species search via iNaturalist taxa API.
   * Returns array of { id, name, commonName, iconUrl, rank }.
   */
  async function searchSpecies(query) {
    if (!query || query.length < 2) return [];

    const url = new URL(`${CONFIG.api.iNaturalist.baseUrl}${CONFIG.api.iNaturalist.taxaEndpoint}`);
    url.searchParams.set('q', query);
    url.searchParams.set('per_page', 10);
    url.searchParams.set('is_active', 'true');

    try {
      const res = await fetch(url);
      const data = await res.json();
      return (data.results || []).map(t => ({
        id: t.id,
        name: t.name,                           // scientific
        commonName: t.preferred_common_name || t.name,
        iconUrl: t.default_photo?.square_url || '',
        rank: t.rank,
      }));
    } catch (e) {
      console.error('iNat taxa search error:', e);
      return [];
    }
  }

  /**
   * Fetch iNaturalist observations for a taxon within NH bounds.
   * Paginates up to CONFIG.api.iNaturalist.maxPages pages.
   * Returns GeoJSON FeatureCollection of points.
   */
  async function fetchINatObservations(taxonId) {
    const { swlat, swlng, nelat, nelng } = CONFIG.nhBounds;
    const perPage = CONFIG.api.iNaturalist.perPage;
    const maxPages = CONFIG.api.iNaturalist.maxPages;
    let allResults = [];

    for (let page = 1; page <= maxPages; page++) {
      const url = new URL(`${CONFIG.api.iNaturalist.baseUrl}${CONFIG.api.iNaturalist.observationsEndpoint}`);
      url.searchParams.set('taxon_id', taxonId);
      url.searchParams.set('swlat', swlat);
      url.searchParams.set('swlng', swlng);
      url.searchParams.set('nelat', nelat);
      url.searchParams.set('nelng', nelng);
      url.searchParams.set('quality_grade', 'research,needs_id');
      url.searchParams.set('per_page', perPage);
      url.searchParams.set('page', page);
      url.searchParams.set('order', 'desc');
      url.searchParams.set('order_by', 'observed_on');

      try {
        const res = await fetch(url);
        const data = await res.json();
        const results = data.results || [];
        allResults = allResults.concat(results);
        // Stop if we got fewer than a full page
        if (results.length < perPage) break;
      } catch (e) {
        console.error(`iNat observations page ${page} error:`, e);
        break;
      }
    }

    // Convert to GeoJSON
    return {
      type: 'FeatureCollection',
      features: allResults
        .filter(o => o.geojson) // only observations with coordinates
        .map(o => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [
              parseFloat(o.geojson.coordinates[0]),
              parseFloat(o.geojson.coordinates[1]),
            ],
          },
          properties: {
            id: o.id,
            source: 'iNaturalist',
            species: o.taxon?.name || 'Unknown',
            commonName: o.taxon?.preferred_common_name || '',
            observedOn: o.observed_on || '',
            observer: o.user?.login || '',
            photoUrl: o.photos?.[0]?.url?.replace('square', 'small') || '',
            uri: o.uri || `https://www.inaturalist.org/observations/${o.id}`,
            qualityGrade: o.quality_grade || '',
          },
        })),
    };
  }

  // ========================================================
  //  eBird
  // ========================================================

  /**
   * Fetch recent eBird observations for a species in NH.
   * Requires CONFIG.api.eBird.apiKey to be set.
   * speciesCode: eBird 6-letter species code (e.g. 'baleag')
   * Returns GeoJSON FeatureCollection.
   */
  async function fetchEBirdObservations(speciesCode) {
    const apiKey = CONFIG.api.eBird.apiKey;
    if (!apiKey) {
      console.warn('eBird API key not set — skipping eBird data.');
      return { type: 'FeatureCollection', features: [] };
    }

    const url = `${CONFIG.api.eBird.baseUrl}/data/obs/US-NH/recent/${speciesCode}?back=30`;

    try {
      const res = await fetch(url, {
        headers: { 'X-eBirdApiToken': apiKey },
      });
      if (!res.ok) throw new Error(`eBird API ${res.status}`);
      const data = await res.json();

      return {
        type: 'FeatureCollection',
        features: (data || []).map(o => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [o.lng, o.lat],
          },
          properties: {
            id: o.subId,
            source: 'eBird',
            species: o.sciName || '',
            commonName: o.comName || '',
            observedOn: o.obsDt || '',
            observer: '',
            locationName: o.locName || '',
            howMany: o.howMany || 1,
            uri: `https://ebird.org/checklist/${o.subId}`,
          },
        })),
      };
    } catch (e) {
      console.error('eBird API error:', e);
      return { type: 'FeatureCollection', features: [] };
    }
  }

  /**
   * Look up eBird species code from a scientific name.
   * Uses eBird taxonomy API. Returns code or null.
   */
  async function lookupEBirdSpeciesCode(scientificName) {
    const apiKey = CONFIG.api.eBird.apiKey;
    if (!apiKey) return null;

    try {
      const url = `${CONFIG.api.eBird.baseUrl}/ref/taxonomy/ebird?fmt=json&species=&cat=species`;
      const res = await fetch(url, {
        headers: { 'X-eBirdApiToken': apiKey },
      });
      if (!res.ok) return null;
      const taxa = await res.json();
      const match = taxa.find(t =>
        t.sciName.toLowerCase() === scientificName.toLowerCase()
      );
      return match?.speciesCode || null;
    } catch (e) {
      console.warn('eBird taxonomy lookup failed:', e);
      return null;
    }
  }

  // ========================================================
  //  Combined fetch
  // ========================================================

  /**
   * Fetch observations from all enabled sources.
   * @param {number}  taxonId        — iNaturalist taxon ID
   * @param {string}  scientificName — for eBird lookup
   * @param {boolean} useINat
   * @param {boolean} useEbird
   * @returns {GeoJSON FeatureCollection}
   */
  async function fetchAllObservations(taxonId, scientificName, useINat = true, useEbird = true) {
    const promises = [];

    if (useINat) {
      promises.push(fetchINatObservations(taxonId));
    }

    if (useEbird) {
      const code = await lookupEBirdSpeciesCode(scientificName);
      if (code) {
        promises.push(fetchEBirdObservations(code));
      } else {
        promises.push(Promise.resolve({ type: 'FeatureCollection', features: [] }));
      }
    }

    const results = await Promise.all(promises);

    // Merge into single FeatureCollection
    return {
      type: 'FeatureCollection',
      features: results.flatMap(fc => fc.features),
    };
  }

  return {
    searchSpecies,
    fetchINatObservations,
    fetchEBirdObservations,
    lookupEBirdSpeciesCode,
    fetchAllObservations,
  };
})();
