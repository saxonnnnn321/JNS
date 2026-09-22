import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import type { InvoiceableExtra, InvoiceableJob } from './build';

/**
 * One-off jobs and extra invoice lines.
 *
 * This is the construction side: work that happens once for an agreed price,
 * rather than a standing plan on a cycle. Invoicing reads from here as well
 * as from the round, which is what lets a customer who has never had a mow
 * still get a bill.
 *
 * Server-side only.
 */

export type JobStatus =
  | 'quoted'
  | 'scheduled'
  | 'in_progress'
  | 'done'
  | 'cancelled';

export type OneOffJob = {
  id: string;
  customerId: string;
  propertyId?: string;
  title: string;
  description?: string;
  kind: string;
  priceCents: number;
  materialsCents: number;
  estimatedMinutes?: number;
  status: JobStatus;
  scheduledFor?: string;
  completedOn?: string;
  invoiceId?: string;
  notes?: string;
};

export type Extra = {
  id: string;
  customerId: string;
  description: string;
  amountCents: number;
  incurredOn: string;
  invoiceId?: string;
};

type JobRow = {
  id: string;
  customer_id: string;
  property_id: string | null;
  title: string;
  description: string | null;
  kind: string;
  price_cents: number;
  materials_cents: number;
  estimated_minutes: number | null;
  status: JobStatus;
  scheduled_for: string | null;
  completed_on: string | null;
  invoice_id: string | null;
  notes: string | null;
};

const JOB_COLUMNS =
  'id, customer_id, property_id, title, description, kind, price_cents, materials_cents, estimated_minutes, status, scheduled_for, completed_on, invoice_id, notes';

function toJob(row: JobRow): OneOffJob {
  return {
    id: row.id,
    customerId: row.customer_id,
    propertyId: row.property_id ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    kind: row.kind,
    priceCents: row.price_cents,
    materialsCents: row.materials_cents,
    estimatedMinutes: row.estimated_minutes ?? undefined,
    status: row.status,
    scheduledFor: row.scheduled_for ?? undefined,
    completedOn: row.completed_on ?? undefined,
    invoiceId: row.invoice_id ?? undefined,
    notes: row.notes ?? undefined,
  };
}

/** Every job for a customer, newest first. Empty if 0006 has not been run. */
export async function jobsForCustomer(customerId: string): Promise<OneOffJob[]> {
  if (!supabaseConfigured) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('one_off_jobs')
    .select(JOB_COLUMNS)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return ((data ?? []) as JobRow[]).map(toJob);
}

/** Every job across the business, for the jobs board. */
export async function allJobs(): Promise<OneOffJob[]> {
  if (!supabaseConfigured) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('one_off_jobs')
    .select(JOB_COLUMNS)
    .neq('status', 'cancelled')
    .order('scheduled_for', { ascending: true, nullsFirst: false })
    .limit(300);
  if (error) return [];
  return ((data ?? []) as JobRow[]).map(toJob);
}

export async function extrasForCustomer(customerId: string): Promise<Extra[]> {
  if (!supabaseConfigured) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('invoice_extras')
    .select('id, customer_id, description, amount_cents, incurred_on, invoice_id')
    .eq('customer_id', customerId)
    .order('incurred_on', { ascending: false });
  if (error) return [];
  return (
    (data ?? []) as {
      id: string;
      customer_id: string;
      description: string;
      amount_cents: number;
      incurred_on: string;
      invoice_id: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    description: row.description,
    amountCents: row.amount_cents,
    incurredOn: row.incurred_on,
    invoiceId: row.invoice_id ?? undefined,
  }));
}

/**
 * What can go on an invoice right now: finished jobs and extras that have not
 * already been billed. The `invoice_id is null` test is the thing that stops
 * the same wall being charged twice.
 */
export function billableJobs(
  jobs: OneOffJob[],
  propertyLabel: (propertyId?: string) => string | undefined,
): InvoiceableJob[] {
  return jobs
    .filter((job) => job.status === 'done' && !job.invoiceId && job.completedOn)
    .map((job) => ({
      jobId: job.id,
      title: job.title,
      propertyLabel: propertyLabel(job.propertyId),
      completedOn: job.completedOn as string,
      priceCents: job.priceCents,
      materialsCents: job.materialsCents,
    }));
}

export function billableExtras(extras: Extra[]): InvoiceableExtra[] {
  return extras
    .filter((extra) => !extra.invoiceId)
    .map((extra) => ({
      extraId: extra.id,
      description: extra.description,
      amountCents: extra.amountCents,
      incurredOn: extra.incurredOn,
    }));
}
