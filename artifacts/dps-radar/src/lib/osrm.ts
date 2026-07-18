export interface RouteResult {
  geometry: { coordinates: [number, number][] }; // LineString GeoJSON
  distance: number;
  duration: number;
}

const OSRM_BASE_URL = 'https://router.project-osrm.org';

function toRad(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function toDeg(radians: number) {
  return (radians * 180) / Math.PI;
}

// Distance in meters between two lat/lng points
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculates distance from point (lat3, lon3) to line segment (lat1, lon1)-(lat2, lon2)
// Very rough approximation using flat earth since distances are small (< 10km)
function pointToSegmentDistance(lat1: number, lon1: number, lat2: number, lon2: number, lat3: number, lon3: number) {
  // convert to meters roughly ( Благовещенск is ~50 deg N)
  const latToM = 111132;
  const lonToM = 111132 * Math.cos(toRad(50.29));
  
  const x1 = lon1 * lonToM;
  const y1 = lat1 * latToM;
  const x2 = lon2 * lonToM;
  const y2 = lat2 * latToM;
  const x3 = lon3 * lonToM;
  const y3 = lat3 * latToM;
  
  const px = x2 - x1;
  const py = y2 - y1;
  const norm = px * px + py * py;
  
  let u = ((x3 - x1) * px + (y3 - y1) * py) / norm;
  if (u > 1) u = 1;
  else if (u < 0) u = 0;
  
  const x = x1 + u * px;
  const y = y1 + u * py;
  
  const dx = x - x3;
  const dy = y - y3;
  
  return Math.sqrt(dx * dx + dy * dy);
}

// Calculate perpendicular offset point
function calculateOffsetPoint(lat1: number, lon1: number, lat2: number, lon2: number, centerLat: number, centerLon: number, offsetMeters: number) {
  const latToM = 111132;
  const lonToM = 111132 * Math.cos(toRad(50.29));

  // vector from 1 to 2
  let vx = (lon2 - lon1) * lonToM;
  let vy = (lat2 - lat1) * latToM;
  
  const len = Math.sqrt(vx * vx + vy * vy);
  if (len === 0) return { lat: centerLat, lon: centerLon };
  
  // normalized
  vx /= len;
  vy /= len;
  
  // perpendicular vector (-vy, vx) or (vy, -vx)
  // Let's just pick one
  const px = -vy;
  const py = vx;
  
  const newLon = centerLon + (px * offsetMeters) / lonToM;
  const newLat = centerLat + (py * offsetMeters) / latToM;
  
  return { lat: newLat, lon: newLon };
}


// Check if a route passes near any DPS posts, and returns an avoiding waypoint if needed
export function calculateAvoidanceWaypoints(routeCoords: [number, number][], dpsPosts: {lat: number, lng: number}[]) {
  const waypoints: {lat: number, lon: number}[] = [];
  const AVOID_RADIUS_M = 300;
  
  for (const post of dpsPosts) {
    let minDistance = Infinity;
    let closestSegment: { p1: [number, number], p2: [number, number] } | null = null;
    
    // OSRM returns coordinates as [lon, lat]
    for (let i = 0; i < routeCoords.length - 1; i++) {
      const p1 = routeCoords[i];
      const p2 = routeCoords[i + 1];
      
      const dist = pointToSegmentDistance(p1[1], p1[0], p2[1], p2[0], post.lat, post.lng);
      if (dist < minDistance) {
        minDistance = dist;
        closestSegment = { p1, p2 };
      }
    }
    
    if (minDistance < AVOID_RADIUS_M && closestSegment) {
      // Calculate a waypoint offset by ~300m from the post perpendicular to the closest segment
      const wp = calculateOffsetPoint(
        closestSegment.p1[1], closestSegment.p1[0], 
        closestSegment.p2[1], closestSegment.p2[0], 
        post.lat, post.lng, 
        AVOID_RADIUS_M
      );
      waypoints.push(wp);
    }
  }
  
  return waypoints;
}

export async function fetchOsrmRoute(waypoints: {lat: number, lon: number}[]): Promise<RouteResult | null> {
  if (waypoints.length < 2) return null;
  
  const coordsStr = waypoints.map(wp => `${wp.lon},${wp.lat}`).join(';');
  const res = await fetch(`${OSRM_BASE_URL}/route/v1/driving/${coordsStr}?geometries=geojson&overview=full`);
  if (!res.ok) return null;
  
  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) return null;
  
  const route = data.routes[0];
  return {
    geometry: route.geometry,
    distance: route.distance,
    duration: route.duration
  };
}