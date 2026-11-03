export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371.0;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Computes straight-line spherical distance between two geographical points in kilometers
 * using the Haversine formula (Design Doc §5.1, ADR-004).
 */
export function calculateHaversineDistanceKm(pointA: LatLng, pointB: LatLng): number {
  const dLat = toRadians(pointB.lat - pointA.lat);
  const dLng = toRadians(pointB.lng - pointA.lng);

  const lat1 = toRadians(pointA.lat);
  const lat2 = toRadians(pointB.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;

  // Round to 2 decimal places (e.g. 1.45 km)
  return Math.round(distance * 100) / 100;
}

/**
 * Evaluates whether a customer's location is within a shop's configured service radius.
 */
export function isWithinRange(
  shopLocation: LatLng,
  customerLocation: LatLng,
  serviceRadiusKm: number
): boolean {
  if (serviceRadiusKm <= 0) return false;
  const distance = calculateHaversineDistanceKm(shopLocation, customerLocation);
  return distance <= serviceRadiusKm;
}
