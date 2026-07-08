/**
 * routingService.js
 * =================
 * Handles routing, distance, travel duration/ETA, and polyline calculations.
 * Integrates with OpenRouteService, and falls back to straight-line Haversine math.
 */

// Haversine distance in km
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Gets distance, duration, and polyline path between start and end.
 * Coordinates are: { lat, lng }
 */
async function getDirections(start, end) {
  const apiKey = process.env.OPENROUTE_SERVICE_API_KEY || '';
  
  if (!start || !end || !start.lat || !start.lng || !end.lat || !end.lng) {
    throw new Error('Start and end coordinates are required with lat/lng keys');
  }

  // Ensure values are numbers
  const sLat = Number(start.lat);
  const sLng = Number(start.lng);
  const eLat = Number(end.lat);
  const eLng = Number(end.lng);

  if (isNaN(sLat) || isNaN(sLng) || isNaN(eLat) || isNaN(eLng)) {
    throw new Error('Coordinates must be valid numbers');
  }

  try {
    if (!apiKey) {
      console.log('[Routing] No OpenRouteService API key configured. Using straight-line fallback.');
      return getHaversineFallback(sLat, sLng, eLat, eLng);
    }

    // OpenRouteService expects start/end as longitude,latitude
    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${sLng},${sLat}&end=${eLng},${eLat}`;
    
    // Fetch with a 4-second timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'TechnicianApp/1.0' }
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`ORS API returned status ${response.status}`);
    }

    const data = await response.json();
    if (data.features && data.features.length > 0) {
      const route = data.features[0];
      const distanceMetres = route.properties.summary.distance || 0; // meters
      const durationSeconds = route.properties.summary.duration || 0; // seconds
      
      // Coordinates are in [lng, lat], map to [lat, lng] for Leaflet/Flutter Map
      const polyline = (route.geometry.coordinates || []).map(coord => [coord[1], coord[0]]);

      return {
        distanceKm: distanceMetres / 1000,
        durationMinutes: durationSeconds / 60,
        polyline,
        source: 'ors'
      };
    }
    
    throw new Error('No features found in ORS response');
  } catch (err) {
    console.warn('[Routing] OpenRouteService call failed or timed out. Falling back to Haversine route.', err.message);
    return getHaversineFallback(sLat, sLng, eLat, eLng);
  }
}

function getHaversineFallback(lat1, lng1, lat2, lng2) {
  const dist = haversineKm(lat1, lng1, lat2, lng2);
  
  // Assume average city driving speed of 30 km/h: time (hours) = distance / 30.
  // time (minutes) = (distance / 30) * 60 = distance * 2.
  const duration = dist * 2; 

  return {
    distanceKm: parseFloat(dist.toFixed(2)),
    durationMinutes: parseFloat(duration.toFixed(1)),
    polyline: [
      [lat1, lng1],
      [lat2, lng2]
    ],
    source: 'haversine'
  };
}

module.exports = {
  getDirections,
  haversineKm,
};
