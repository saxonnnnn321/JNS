import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import { BUSINESS } from '@/lib/business';
import { RATE_CARD } from '@/lib/rate-card';
import { addDays, businessDate } from '@/lib/dates';
import type { JobQuoteData } from '@/lib/pdf/job-quote-document';

/**
 * Everything needed to put a construction quote on paper.
 *
 * The reference is assigned the first time a quote is produced and then kept
 * for good, so the number on the customer's copy never changes under them.
 * That is why this reads and sometimes writes, rather than being a pure
 * lookup.
 *
 * Server-side only.
 */

export type JobQuote = JobQuoteData & {
  jobId: string;
  customerId: string;
  customerEmail?: string;
  sentAt?: string;
};

function reference(sequence: number): string {
  return `Q-${String(Math.max(1, sequence)).padStart(4, '0')}`;
}

export async function loadJobQuote(jobId: string): Promise<JobQuote | null> {
  if (!supabaseConfigured) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('one_off_jobs')
    .select(
      'id, customer_id, property_id, title, description, price_cents, materials_cents, pricing, labour_rate_cents, markup_basis_points, quote_reference, quote_sent_at, created_at, customers (name, email, phone), properties (address_line, suburb)',
    )
    .eq('id', jobId)
    .maybeSingle();

  if (error || !data) return null;

  type Row = {
    id: string;
    customer_id: string;
    title: string;
    description: string | null;
    price_cents: number;
    materials_cents: number;
    pricing: string | null;
    labour_rate_cents: number | null;
    markup_basis_points: number | null;
    quote_reference: string | null;
    quote_sent_at: string | null;
    created_at: string;
    customers:
      | { name: string; email: string | null; phone: string | null }
      | { name: string; email: string | null; phone: string | null }[]
      | null;
    properties:
      | { address_line: string; suburb: string }
      | { address_line: string; suburb: string }[]
      | null;
  };

  const one = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  const row = data as unknown as Row;
  const customer = one(row.customers);
  const property = one(row.properties);

  // Assign a reference the first time, then leave it alone.
  let quoteReference = row.quote_reference;
  if (!quoteReference) {
    const { count } = await supabase
      .from('one_off_jobs')
      .select('id', { count: 'exact', head: true })
      .not('quote_reference', 'is', null);

    for (const candidate of [
      reference((count ?? 0) + 1),
      `Q-${Date.now().toString().slice(-8)}`,
    ]) {
      const { error: writeError } = await supabase
        .from('one_off_jobs')
        .update({ quote_reference: candidate })
        .eq('id', jobId);
      if (!writeError) {
        quoteReference = candidate;
        break;
      }
    }
    // Still nothing? Show the customer something rather than failing.
    quoteReference ??= `Q-${jobId.slice(0, 6).toUpperCase()}`;
  }

  const isCostPlus = row.pricing === 'costPlus';
  const subtotal = isCostPlus ? 0 : row.price_cents + row.materials_cents;
  const gstCents =
    BUSINESS.gstRegistered && subtotal > 0
      ? Math.round(subtotal * BUSINESS.gstRate)
      : 0;

  const issued = businessDate();

  return {
    jobId: row.id,
    customerId: row.customer_id,
    customerEmail: customer?.email ?? undefined,
    sentAt: row.quote_sent_at ?? undefined,

    reference: quoteReference,
    issuedDate: issued,
    validUntil: addDays(issued, RATE_CARD.quoteValidDays),
    customer: {
      name: customer?.name ?? 'Customer',
      email: customer?.email ?? undefined,
      phone: customer?.phone ?? undefined,
    },
    propertyLabel: property
      ? `${property.address_line}, ${property.suburb}`
      : undefined,
    title: row.title,
    scope: row.description ?? undefined,
    isCostPlus,
    labourRateCents: row.labour_rate_cents ?? 15_000,
    markupBasisPoints: row.markup_basis_points ?? 0,
    priceCents: row.price_cents,
    materialsCents: row.materials_cents,
    gstCents,
    totalCents: subtotal + gstCents,
  };
}
