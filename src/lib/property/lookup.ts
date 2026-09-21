/**
 * Address in, everything needed to price a job out.
 *
 *   free text → parse → NSW address point → NSW lot boundary
 *                                              ↓
 *                         OSM building footprints (best effort)
 *                                              ↓
 *                                    estimateSite() → measurements
 *
 * The network parts are here; the judgement is in estimate-site.ts, which is
 * pure and tested on its own.
 */

import { AddressParseError, parseAddress } from './address';
import { polygonAreaM2, ringPerimeterM } from './geo';
import { findLot, searchAddress } from './nsw';
import { findBuildingFootprints } from './buildings';
import { estimateSite, type SiteEstimateResult } from './estimate-site';

export class PropertyLookupError extends Error {}

/**
 * Lookups are cached in memory for an hour. The cadastre does not change, and
 * re-quoting the same address should not re-hit two public services that both
 * rate-limit. Process-local, so it resets on deploy — that is fine.
 */
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; result: PropertyLookupResult }>();

function cacheKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export interface PropertyLookupResult extends SiteEstimateResult {
  address: {
    formatted: string;
    addressLine: string;
    suburb: string;
    state: 'NSW';
    postcode: string;
    exact: boolean;
  };
  parcel: {
    lotId: string | null;
    areaM2: number;
    perimeterM: number;
    lat: number;
    lon: number;
  };
  buildingSource: 'openstreetmap' | 'assumed';
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

export async function lookupProperty(raw: string): Promise<PropertyLookupResult> {
  const parsed = parseAddress(raw); // throws AddressParseError

  const key = cacheKey(raw);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return hit.result;
  }

  const match = await searchAddress(parsed).catch((cause) => {
    throw new PropertyLookupError(
      `Could not reach the NSW address service (${cause.message})`,
    );
  });
  if (!match) {
    throw new PropertyLookupError(
      'No NSW address matched that. Check the street name and suburb.',
    );
  }

  const lot = await findLot(match.lon, match.lat).catch((cause) => {
    throw new PropertyLookupError(
      `Could not reach the NSW cadastre (${cause.message})`,
    );
  });
  if (!lot) {
    throw new PropertyLookupError(
      `Found ${titleCase(match.formatted)} but no lot boundary on file for it.`,
    );
  }

  const areaM2 = polygonAreaM2(lot.rings);
  const perimeterM = ringPerimeterM(lot.rings[0]);

  // Best effort. A failure here costs confidence, not the whole lookup.
  const footprint = await findBuildingFootprints(match.lon, match.lat, lot.rings[0]);

  const estimate = estimateSite({
    parcelAreaM2: areaM2,
    parcelPerimeterM: perimeterM,
    buildingAreaM2: footprint?.areaM2 ?? null,
    buildingCount: footprint?.count,
    addressExact: match.exact,
  });

  const addressLine = titleCase(
    [parsed.houseNumber, parsed.roadName, parsed.roadType]
      .filter(Boolean)
      .join(' '),
  );

  const result: PropertyLookupResult = {
    ...estimate,
    address: {
      formatted: titleCase(match.formatted),
      addressLine,
      suburb: titleCase(match.suburb),
      state: 'NSW',
      postcode: match.postcode,
      exact: match.exact,
    },
    parcel: {
      lotId: lot.lotId,
      areaM2: Math.round(areaM2),
      perimeterM: Math.round(perimeterM),
      lat: match.lat,
      lon: match.lon,
    },
    buildingSource: footprint ? 'openstreetmap' : 'assumed',
  };

  cache.set(key, { at: Date.now(), result });
  return result;
}

export { AddressParseError };
