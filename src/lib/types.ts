import type { TaskKey } from './rate-card';

export type GrassHeight = 'short' | 'normal' | 'long' | 'overgrown' | 'severe';
export type ObstacleDensity = 'none' | 'low' | 'moderate' | 'high';
export type Slope = 'flat' | 'gentle' | 'moderate' | 'steep';
export type Access = 'open' | 'standardGate' | 'narrowGate' | 'stairsOnly';

/** What the site is like. In step 3 this comes back from the photo assessment. */
export interface SiteConditions {
  grassHeight: GrassHeight;
  obstacleDensity: ObstacleDensity;
  slope: Slope;
  access: Access;
  /** 0..1 — how sure we are. Drives the quote band and the site-visit flag. */
  confidence: number;
}

/** What the site measures. In step 2 this comes off the map. */
export interface SiteMeasurements {
  lawnAreaM2: number;
  edgeMetres: number;
  hardSurfaceM2: number;
  bedEdgeMetres: number;
  hedgeMetres: number;
  weedAreaM2: number;
  greenWasteM3: number;
  travelKm: number;
}

export interface Customer {
  name: string;
  email?: string;
  phone?: string;
}

export interface PropertyAddress {
  addressLine: string;
  suburb: string;
  state: string;
  postcode: string;
}

/** A manually added charge that the engine does not calculate. */
export interface ExtraCharge {
  description: string;
  amount: number;
}

/**
 * Time the operator has stated outright — "weeding, about an hour".
 *
 * Priced at the hourly rate and deliberately NOT scaled by the site condition
 * multipliers: when Saxon says an hour, he means an hour, having already
 * accounted for the long grass and the narrow gate himself.
 */
export interface LabourAddition {
  description: string;
  minutes: number;
}

export interface QuoteRequest {
  customer: Customer;
  property: PropertyAddress;
  measurements: SiteMeasurements;
  conditions: SiteConditions;
  /** Which packages to price. Defaults to standard + fullTidy. */
  packageKeys?: PackageKey[];
  extras?: ExtraCharge[];
  labourAdditions?: LabourAddition[];
  notes?: string;
}

export type PackageKey = 'standard' | 'fullTidy';

/** One priced row on the quote. `amountCents` is ex GST. */
export interface LineItem {
  task: TaskKey | 'greenWaste' | 'travel' | 'setup' | 'extra' | 'statedLabour';
  description: string;
  quantity: number | null;
  unit: string | null;
  minutes: number;
  amountCents: number;
  /** Every multiplier that touched this row, for the "show your working" view. */
  appliedFactors: { name: string; factor: number }[];
}

export interface QuoteOption {
  key: PackageKey;
  name: string;
  blurb: string;
  items: LineItem[];
  totalMinutes: number;
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  /** Rounding adjustment applied to reach a tidy subtotal, in cents. */
  roundingCents: number;
  /** True when the minimum charge set the price rather than the time did. */
  minimumChargeApplied: boolean;
  bandLowCents: number;
  bandHighCents: number;
}

export interface QuoteEstimate {
  reference: string;
  /** ISO instant the quote was generated. */
  issuedAt: string;
  /** Calendar date in NSW, 'YYYY-MM-DD'. This is what goes on the document. */
  issuedDate: string;
  /** Calendar date in NSW, 'YYYY-MM-DD'. */
  validUntil: string;
  customer: Customer;
  property: PropertyAddress;
  measurements: SiteMeasurements;
  conditions: SiteConditions;
  options: QuoteOption[];
  notes?: string;
  gstRegistered: boolean;
  /** Set when confidence is low or the job is big — quote a visit, not a price. */
  needsSiteVisit: boolean;
  siteVisitReasons: string[];
}
