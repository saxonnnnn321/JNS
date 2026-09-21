/**
 * Building footprints from OpenStreetMap, via Overpass.
 *
 * Free and open-licensed, but two caveats drive the design here:
 *  - Coverage is patchy. Some NSW suburbs are fully traced, others have almost
 *    nothing.
 *  - The public Overpass instances rate-limit and time out regularly. One of
 *    three test lookups returned a 504 while building this.
 *
 * So this NEVER throws. A failure returns null and the estimator falls back to
 * an assumed site coverage with lower confidence. A quote that is slightly less
 * certain beats a lookup that fails.
 *
 * The paid upgrade path is Geoscape Buildings or Nearmap, both of which have
 * complete Australian coverage.
 */

import { pointInRing, ringAreaM2, ringCentroid, type Ring } from './geo';

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

/**
 * Overpass is slow — 10-20s is normal, and a 9s budget silently failed EVERY
 * lookup during development, quietly throwing away good footprint data and
 * dropping confidence to the assumed-coverage path. Give it room, and race both
 * mirrors so one slow instance does not set the pace.
 */
const TIMEOUT_MS = 12_000;

/** Overpass blocks unidentified clients. Identify the tool honestly. */
const USER_AGENT = 'JNS-Quote-System/0.1 (landscaping quote tool)';
/** Ignore sheds and bin stores; we want the house and the garage. */
const MIN_FOOTPRINT_M2 = 12;

export interface FootprintResult {
  areaM2: number;
  count: number;
}

/**
 * Overall budget. Footprints are a nice-to-have: past this the estimator falls
 * back to assumed coverage rather than leaving the operator watching a spinner.
 */
const BUDGET_MS = 13_000;

export async function findBuildingFootprints(
  lon: number,
  lat: number,
  parcel: Ring,
): Promise<FootprintResult | null> {
  return Promise.race([
    queryFootprints(lon, lat, parcel),
    new Promise<null>((resolve) => {
      const timer = setTimeout(() => resolve(null), BUDGET_MS);
      // Do not hold the process open for a best-effort lookup.
      timer.unref?.();
    }),
  ]);
}

async function queryFootprints(
  lon: number,
  lat: number,
  parcel: Ring,
): Promise<FootprintResult | null> {
  const query = `[out:json][timeout:20];way["building"](around:60,${lat},${lon});out geom;`;

  const attempts = MIRRORS.map(async (mirror) => {
    const response = await fetch(mirror, {
      method: 'POST',
      body: new URLSearchParams({ data: query }),
      headers: {
        // Overpass REQUIRES this. Without a User-Agent both mirrors answer 200
        // with an HTML error page, JSON parsing blows up, and the whole thing
        // silently degrades to assumed coverage. Cost an hour to find.
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`${new URL(mirror).hostname} returned ${response.status}`);
    }
    if (!response.headers.get('content-type')?.includes('json')) {
      throw new Error(`${new URL(mirror).hostname} did not return JSON`);
    }
    return response.json();
  });

  let data: unknown;
  try {
    data = await Promise.any(attempts);
  } catch {
    // Every mirror failed. The estimator falls back to assumed coverage.
    return null;
  }

  const elements: { geometry?: { lat: number; lon: number }[] }[] =
    (data as { elements?: { geometry?: { lat: number; lon: number }[] }[] })
      ?.elements ?? [];

  let areaM2 = 0;
  let count = 0;
  for (const element of elements) {
    if (!element.geometry || element.geometry.length < 3) continue;
    const ring: Ring = element.geometry.map((p) => [p.lon, p.lat]);

    // Only count what sits on THIS block. Verified against a Penrith block
    // where OSM had 14 buildings within 60 m and exactly one was the house.
    if (!pointInRing(ringCentroid(ring), parcel)) continue;

    const area = ringAreaM2(ring);
    if (area < MIN_FOOTPRINT_M2) continue;
    areaM2 += area;
    count += 1;
  }

  return count > 0 ? { areaM2, count } : null;
}
