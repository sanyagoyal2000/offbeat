/** Distance helpers. Walking figures are estimates: straight-line × 1.3 at 5 km/h. */

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;

export function straightLineMeters(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Estimate: streets are ~30% longer than the straight line. */
export const WALK_DETOUR = 1.3;
/** Estimate: 5 km/h walking pace. */
export const WALK_METERS_PER_MIN = 5000 / 60;

export const walkMeters = (a: LatLng, b: LatLng) => straightLineMeters(a, b) * WALK_DETOUR;
export const walkMinutes = (meters: number) => meters / WALK_METERS_PER_MIN;

/** "1.2 km" (straight line, one decimal). */
export const formatKm = (meters: number) => `${(meters / 1000).toFixed(1)} km`;
/** "600 m walk", rounded to 50 m; switches to km above 1 km. */
export function formatWalk(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km walk`;
  return `${Math.round(meters / 50) * 50} m walk`;
}

/** Average point of a set of venues (used as an area centre when no explicit point is given). */
export function centroid(points: LatLng[]): LatLng | null {
  if (!points.length) return null;
  return { lat: points.reduce((n, p) => n + p.lat, 0) / points.length, lng: points.reduce((n, p) => n + p.lng, 0) / points.length };
}
