import type { PackageKey } from '../types';

export type Frequency = 'weekly' | 'fortnightly' | 'monthly' | 'onceOff';

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  since: string; // YYYY-MM-DD
  notes?: string;
}

export interface Property {
  id: string;
  customerId: string;
  addressLine: string;
  suburb: string;
  state: string;
  postcode: string;
  lotId?: string;
  parcelAreaM2?: number;
  lawnAreaM2?: number;
  /** Job-sheet facts that do not change between visits. */
  accessNotes?: string;
}

/**
 * A standing arrangement to visit a property on a cycle. This is the round —
 * the thing a mowing business actually runs on.
 */
export interface ServicePlan {
  id: string;
  customerId: string;
  propertyId: string;
  frequency: Frequency;
  /** A date a visit lands on. Every later visit is counted from here, so this
   *  also fixes the day of the week. */
  anchorDate: string;
  packageKey: PackageKey;
  priceCents: number;
  estimatedMinutes: number;
  active: boolean;
  /** Customers go away, or the grass stops growing. Inclusive. */
  pausedUntil?: string;
}

export type VisitStatus = 'scheduled' | 'done' | 'skipped';

export interface Visit {
  id: string;
  planId: string;
  date: string;
  status: VisitStatus;
  /** The number that makes the rate card better. */
  actualMinutes?: number;
  invoiceId?: string;
  notes?: string;
}

/** A plan joined to its customer and property, ready to put on screen. */
export interface RoundStop {
  plan: ServicePlan;
  customer: Customer;
  property: Property;
  date: string;
}
