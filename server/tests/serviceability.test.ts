import { describe, it, expect } from 'vitest';
import {
  calculateHaversineDistanceKm,
  isWithinRange,
  LatLng,
} from '../src/modules/serviceability/index.js';

describe('Haversine Serviceability Engine', () => {
  // Coordinates in Bengaluru, India
  const shopMGroad: LatLng = { lat: 12.9752, lng: 77.6095 };
  const customerIndiranagar: LatLng = { lat: 12.9784, lng: 77.6408 }; // ~3.4 km straight-line
  const customerWhitefield: LatLng = { lat: 12.9698, lng: 77.7499 };  // ~15 km straight-line

  it('calculates 0 km distance for identical points', () => {
    const dist = calculateHaversineDistanceKm(shopMGroad, shopMGroad);
    expect(dist).toBe(0);
  });

  it('calculates accurate straight-line distance between two known coordinates', () => {
    const dist = calculateHaversineDistanceKm(shopMGroad, customerIndiranagar);
    expect(dist).toBeGreaterThan(3.3);
    expect(dist).toBeLessThan(3.5);
    expect(dist).toBe(3.41);
  });

  it('correctly reports in-range when customer is well within service radius', () => {
    const within = isWithinRange(shopMGroad, customerIndiranagar, 5.0);
    expect(within).toBe(true);
  });

  it('correctly reports out-of-range when customer is beyond service radius', () => {
    const within = isWithinRange(shopMGroad, customerWhitefield, 5.0);
    expect(within).toBe(false);
  });

  it('handles boundary case: distance exactly equal to service radius', () => {
    const dist = calculateHaversineDistanceKm(shopMGroad, customerIndiranagar); // 3.41 km
    expect(isWithinRange(shopMGroad, customerIndiranagar, dist)).toBe(true);
  });

  it('handles boundary case: customer location marginally outside radius', () => {
    const dist = calculateHaversineDistanceKm(shopMGroad, customerIndiranagar); // 3.41 km
    expect(isWithinRange(shopMGroad, customerIndiranagar, dist - 0.01)).toBe(false);
  });

  it('rejects non-positive service radii', () => {
    expect(isWithinRange(shopMGroad, customerIndiranagar, 0)).toBe(false);
    expect(isWithinRange(shopMGroad, customerIndiranagar, -1)).toBe(false);
  });

  // ─── Edge Cases ──────────────────────────────────────────────────────────────

  it('calculates distance between antipodal points (~20015 km)', () => {
    const northPole: LatLng = { lat: 90, lng: 0 };
    const southPole: LatLng = { lat: -90, lng: 0 };
    const dist = calculateHaversineDistanceKm(northPole, southPole);
    // Half the Earth's circumference ~= 20015 km
    expect(dist).toBeGreaterThan(19000);
    expect(dist).toBeLessThan(21000);
  });

  it('calculates distance on the equator across the prime meridian', () => {
    const a: LatLng = { lat: 0, lng: -1 };
    const b: LatLng = { lat: 0, lng: 1 };
    const dist = calculateHaversineDistanceKm(a, b);
    // 2 degrees of longitude at equator ≈ 222.4 km
    expect(dist).toBeGreaterThan(220);
    expect(dist).toBeLessThan(225);
  });

  it('handles coordinates at exactly 0,0 (null island)', () => {
    const origin: LatLng = { lat: 0, lng: 0 };
    expect(calculateHaversineDistanceKm(origin, origin)).toBe(0);
  });

  it('is symmetric: dist(A,B) equals dist(B,A)', () => {
    const a: LatLng = { lat: 12.9752, lng: 77.6095 };
    const b: LatLng = { lat: 12.9784, lng: 77.6408 };
    const ab = calculateHaversineDistanceKm(a, b);
    const ba = calculateHaversineDistanceKm(b, a);
    expect(ab).toBe(ba);
  });

  it('correctly identifies isWithinRange for very large radius (whole world)', () => {
    const a: LatLng = { lat: 0, lng: 0 };
    const b: LatLng = { lat: 89, lng: 179 }; // Near the edge of the world
    expect(isWithinRange(a, b, 25000)).toBe(true); // 25000 km > max earth distance
  });
});
