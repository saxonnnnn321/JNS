/**
 * NSW Government spatial services. Both are public and need no API key.
 *
 *  - Address_Location (SIX Maps): a typed address → a point and a property id.
 *  - NSW_Land_Parcel_Property_Theme layer 8 "Lot": a point → the lot boundary.
 *
 * Layer 12 "Property" looks like the obvious choice but returns one row per
 * address, so a block of units comes back 128 times. Layer 8 gives one lot.
 */

import type { ParsedAddress } from './address';
import type { Ring } from './geo';

const ADDRESS_URL = 'https://maps.six.nsw.gov.au/services/public/Address_Location';
const LOT_URL =
  'https://portal.spatial.nsw.gov.au/server/rest/services/NSW_Land_Parcel_Property_Theme/MapServer/8/query';

const TIMEOUT_MS = 12_000;

export interface AddressMatch {
  formatted: string;
  suburb: string;
  postcode: string;
  lon: number;
  lat: number;
  /** False when the service had to fall back to a nearby number or suburb. */
  exact: boolean;
  matchNotes: string[];
}

export interface LotMatch {
  lotId: string | null;
  rings: Ring[];
}

async function getJson(url: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const response = await fetch(`${url}?${query}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  }
  return response.json();
}

export async function searchAddress(
  parsed: ParsedAddress,
): Promise<AddressMatch | null> {
  const params: Record<string, string> = {
    houseNumber: parsed.houseNumber,
    roadName: parsed.roadName,
    projection: 'EPSG:4326',
  };
  if (parsed.roadType) params.roadType = parsed.roadType;
  if (parsed.suburb) params.suburb = parsed.suburb;
  if (parsed.postcode) params.postCode = parsed.postcode;

  const data = await getJson(ADDRESS_URL, params);
  const result = data?.addressResult;
  const hit = result?.addresses?.[0];
  if (!hit) return null;

  const notes: string[] = result?.searchMethod?.methodDescriptions ?? [];
  // The service tells you when it had to improvise. Surface that rather than
  // silently quoting the wrong house.
  const exact = notes.some((n: string) => /input parameters matched/i.test(n));

  return {
    formatted: hit.shortAddressString,
    suburb: hit.suburbName ?? '',
    postcode: String(hit.postCode ?? ''),
    lon: hit.addressPoint.centreX,
    lat: hit.addressPoint.centreY,
    exact,
    matchNotes: notes,
  };
}

export async function findLot(lon: number, lat: number): Promise<LotMatch | null> {
  const data = await getJson(LOT_URL, {
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'lotidstring',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'json',
  });

  const feature = data?.features?.[0];
  if (!feature?.geometry?.rings?.length) return null;

  return {
    lotId: feature.attributes?.lotidstring ?? null,
    rings: feature.geometry.rings as Ring[],
  };
}
