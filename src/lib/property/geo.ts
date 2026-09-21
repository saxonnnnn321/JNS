/**
 * Small geometry helpers for working with lat/lon rings from the NSW cadastre.
 *
 * Everything projects to a local metric plane about the ring's own centroid
 * before measuring. At parcel scale (tens of metres) that is accurate to well
 * under 1%, and unlike picking an MGA zone it works anywhere in the state.
 *
 * Do NOT use the `shape_Area` the ArcGIS service returns. That is in Web
 * Mercator, which over-states area by 1/cos²(latitude) — about 45% in Sydney.
 */

export type Position = [number, number]; // [lon, lat]
export type Ring = Position[];

/** Metres per degree of latitude and longitude at a given latitude. */
export function metresPerDegree(latitude: number): { lat: number; lon: number } {
  const phi = (latitude * Math.PI) / 180;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi),
    lon: 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi),
  };
}

function project(ring: Ring): { x: number; y: number }[] {
  const lat0 = ring.reduce((acc, p) => acc + p[1], 0) / ring.length;
  const m = metresPerDegree(lat0);
  return ring.map(([lon, lat]) => ({ x: lon * m.lon, y: lat * m.lat }));
}

export function ringAreaM2(ring: Ring): number {
  if (ring.length < 3) return 0;
  const pts = project(ring);
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function ringPerimeterM(ring: Ring): number {
  if (ring.length < 2) return 0;
  const pts = project(ring);
  let total = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** Esri polygons are [outerRing, ...holes]. Holes subtract. */
export function polygonAreaM2(rings: Ring[]): number {
  if (rings.length === 0) return 0;
  const [outer, ...holes] = rings;
  return Math.max(
    0,
    ringAreaM2(outer) - holes.reduce((acc, hole) => acc + ringAreaM2(hole), 0),
  );
}

export function ringCentroid(ring: Ring): Position {
  const lon = ring.reduce((acc, p) => acc + p[0], 0) / ring.length;
  const lat = ring.reduce((acc, p) => acc + p[1], 0) / ring.length;
  return [lon, lat];
}

/** Ray casting. Used to keep the neighbours' houses out of our footprint total. */
export function pointInRing(point: Position, ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
