import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import { businessDate } from '@/lib/dates';
import type { Customer, Property, ServicePlan, Visit } from './types';
import type { RoundLookup } from './schedule';

/**
 * The round, read from the database.
 *
 * This replaced a file of invented customers. The screens ask for the same
 * shapes they always did, so the pages barely changed — the difference is that
 * everything here is yours, and an empty database honestly shows nothing.
 *
 * One query per table and the joining happens in memory. That is the right
 * trade for a one-ute business: a few dozen customers is nothing to a Postgres
 * index, and it keeps the page code free of query plumbing. If the round ever
 * reaches thousands of rows this is the place to add date-bounded queries.
 *
 * Reads run as the signed-in user, so row level security applies. A staff
 * member who is somehow not on the allow-list sees an empty round, not an
 * error.
 *
 * Server-side only — it reaches cookies through lib/supabase/server.
 */

export type Round = {
  customers: Customer[];
  properties: Property[];
  plans: ServicePlan[];
  visits: Visit[];
  /** The shape lib/crm/schedule.ts wants. */
  lookup: RoundLookup;
  customerById: (id: string) => Customer | undefined;
  propertyById: (id: string) => Property | undefined;
  planById: (id: string) => ServicePlan | undefined;
  propertiesFor: (customerId: string) => Property[];
  plansFor: (customerId: string) => ServicePlan[];
  visitsFor: (customerId: string) => Visit[];
  /** Nothing added yet — the screens say so rather than showing zeroes. */
  isEmpty: boolean;
};

/** Postgres `numeric` can arrive as a string. Null stays undefined. */
function num(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
};

type PropertyRow = {
  id: string;
  customer_id: string | null;
  address_line: string;
  suburb: string;
  state: string | null;
  postcode: string | null;
  lawn_area_m2: number | string | null;
  edge_metres: number | string | null;
  hard_surface_m2: number | string | null;
  access_notes: string | null;
};

type PlanRow = {
  id: string;
  customer_id: string;
  property_id: string;
  frequency: ServicePlan['frequency'];
  anchor_date: string;
  package_key: ServicePlan['packageKey'];
  price_cents: number;
  estimated_minutes: number;
  active: boolean;
  paused_until: string | null;
};

type VisitRow = {
  id: string;
  plan_id: string;
  visit_date: string;
  status: Visit['status'];
  actual_minutes: number | null;
  invoice_id: string | null;
  notes: string | null;
};

function emptyRound(): Round {
  return buildRound([], [], [], []);
}

function buildRound(
  customers: Customer[],
  properties: Property[],
  plans: ServicePlan[],
  visits: Visit[],
): Round {
  const customerById = (id: string) => customers.find((c) => c.id === id);
  const propertyById = (id: string) => properties.find((p) => p.id === id);
  const planById = (id: string) => plans.find((p) => p.id === id);
  const plansFor = (customerId: string) =>
    plans.filter((p) => p.customerId === customerId);

  return {
    customers,
    properties,
    plans,
    visits,
    lookup: { plans, customerById, propertyById },
    customerById,
    propertyById,
    planById,
    plansFor,
    propertiesFor: (customerId) =>
      properties.filter((p) => p.customerId === customerId),
    visitsFor: (customerId) => {
      const ids = new Set(plansFor(customerId).map((p) => p.id));
      return visits
        .filter((v) => ids.has(v.planId))
        .sort((a, b) => b.date.localeCompare(a.date));
    },
    isEmpty: customers.length === 0,
  };
}

export async function loadRound(): Promise<Round> {
  // A fresh clone with no .env.local should render, not crash.
  if (!supabaseConfigured) return emptyRound();

  const supabase = await createClient();
  const [customerResult, propertyResult, planResult, visitResult] =
    await Promise.all([
      supabase
        .from('customers')
        .select('id, name, phone, email, created_at')
        .order('name'),
      supabase
        .from('properties')
        .select(
          'id, customer_id, address_line, suburb, state, postcode, lawn_area_m2, edge_metres, hard_surface_m2, access_notes',
        ),
      supabase
        .from('service_plans')
        .select(
          'id, customer_id, property_id, frequency, anchor_date, package_key, price_cents, estimated_minutes, active, paused_until',
        ),
      supabase
        .from('visits')
        .select('id, plan_id, visit_date, status, actual_minutes, invoice_id, notes')
        .order('visit_date', { ascending: false })
        .limit(500),
    ]);

  const failure =
    customerResult.error ??
    propertyResult.error ??
    planResult.error ??
    visitResult.error;
  if (failure) {
    // Signed in but not on the staff allow-list looks exactly like an empty
    // round, which is the safe way for it to look.
    console.error('could not read the round', failure);
    return emptyRound();
  }

  const customers: Customer[] = ((customerResult.data ?? []) as CustomerRow[]).map(
    (row) => ({
      id: row.id,
      name: row.name,
      phone: text(row.phone),
      email: text(row.email),
      since: businessDate(new Date(row.created_at)),
    }),
  );

  const properties: Property[] = ((propertyResult.data ?? []) as PropertyRow[])
    .filter((row) => row.customer_id !== null)
    .map((row) => ({
      id: row.id,
      customerId: row.customer_id as string,
      addressLine: row.address_line,
      suburb: row.suburb,
      state: row.state ?? 'NSW',
      postcode: row.postcode ?? '',
      lawnAreaM2: num(row.lawn_area_m2),
      accessNotes: text(row.access_notes),
    }));

  const plans: ServicePlan[] = ((planResult.data ?? []) as PlanRow[]).map(
    (row) => ({
      id: row.id,
      customerId: row.customer_id,
      propertyId: row.property_id,
      frequency: row.frequency,
      anchorDate: row.anchor_date,
      packageKey: row.package_key,
      priceCents: row.price_cents,
      estimatedMinutes: row.estimated_minutes,
      active: row.active,
      pausedUntil: row.paused_until ?? undefined,
    }),
  );

  const visits: Visit[] = ((visitResult.data ?? []) as VisitRow[]).map((row) => ({
    id: row.id,
    planId: row.plan_id,
    date: row.visit_date,
    status: row.status,
    actualMinutes: row.actual_minutes ?? undefined,
    invoiceId: row.invoice_id ?? undefined,
    notes: text(row.notes),
  }));

  return buildRound(customers, properties, plans, visits);
}

/**
 * Just enough for the app-wide microphone to recognise a name or an address.
 *
 * Deliberately narrow: this is the one query whose results reach the browser,
 * so it selects names and street lines and nothing else. Phone numbers and
 * customer notes have no business being shipped to the client just so voice
 * can match "Dave".
 */
export async function loadDirectory(): Promise<{
  customers: { id: string; name: string }[];
  properties: { customerId: string; addressLine: string; suburb: string }[];
}> {
  if (!supabaseConfigured) return { customers: [], properties: [] };

  const supabase = await createClient();
  const [customerResult, propertyResult] = await Promise.all([
    supabase.from('customers').select('id, name').order('name').limit(1000),
    supabase.from('properties').select('customer_id, address_line, suburb').limit(2000),
  ]);

  if (customerResult.error || propertyResult.error) {
    return { customers: [], properties: [] };
  }

  return {
    customers: (customerResult.data ?? []) as { id: string; name: string }[],
    properties: ((propertyResult.data ?? []) as {
      customer_id: string | null;
      address_line: string;
      suburb: string;
    }[])
      .filter((row) => row.customer_id !== null)
      .map((row) => ({
        customerId: row.customer_id as string,
        addressLine: row.address_line,
        suburb: row.suburb,
      })),
  };
}
