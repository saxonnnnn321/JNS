import { describe, expect, it } from 'vitest';
import {
  pointInRing,
  polygonAreaM2,
  ringAreaM2,
  ringCentroid,
  ringPerimeterM,
  type Ring,
} from './geo';

/** A rectangle of a known size in metres, built around a Sydney latitude. */
function rectangle(widthM: number, heightM: number, lat = -33.75): Ring {
  const mLat = 111132.92 - 559.82 * Math.cos((2 * lat * Math.PI) / 180);
  const mLon = 111412.84 * Math.cos((lat * Math.PI) / 180);
  const dLon = widthM / mLon;
  const dLat = heightM / mLat;
  const lon = 150.66;
  return [
    [lon, lat],
    [lon + dLon, lat],
    [lon + dLon, lat + dLat],
    [lon, lat + dLat],
  ];
}

describe('geo', () => {
  it('measures a known rectangle to within a fraction of a percent', () => {
    const area = ringAreaM2(rectangle(20, 40));
    expect(area).toBeGreaterThan(800 * 0.995);
    expect(area).toBeLessThan(800 * 1.005);
  });

  it('measures perimeter', () => {
    const perimeter = ringPerimeterM(rectangle(20, 40));
    expect(perimeter).toBeGreaterThan(120 * 0.995);
    expect(perimeter).toBeLessThan(120 * 1.005);
  });

  it('subtracts holes from the outer ring', () => {
    const area = polygonAreaM2([rectangle(20, 40), rectangle(5, 5)]);
    expect(area).toBeGreaterThan(770);
    expect(area).toBeLessThan(780);
  });

  it('matches a real parcel pulled from the NSW cadastre', () => {
    // Lot 19//DP31239, 5 Hope Street Penrith, geometry as the service returns
    // it. The service's own shape_Area says 900 — that is Web Mercator, and
    // 1.45x the truth at this latitude. The real block is ~620 m2.
    const ring: Ring = [
      [150.71081628, -33.75928148],
      [150.71070278, -33.75962874],
      [150.7105409, -33.75959185],
      [150.71065439, -33.75924461],
      [150.71066391, -33.75924678],
    ];
    expect(ringAreaM2(ring)).toBeGreaterThan(600);
    expect(ringAreaM2(ring)).toBeLessThan(645);
    // And the perimeter the edging estimate leans on.
    expect(ringPerimeterM(ring)).toBeGreaterThan(95);
    expect(ringPerimeterM(ring)).toBeLessThan(115);
  });

  it('keeps the neighbours out', () => {
    const parcel = rectangle(20, 40);
    const centre = ringCentroid(parcel);
    expect(pointInRing(centre, parcel)).toBe(true);
    expect(pointInRing([150.70, -33.75], parcel)).toBe(false);
  });
});
