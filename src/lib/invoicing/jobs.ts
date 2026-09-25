import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import type {
  InvoiceableClaim,
  InvoiceableExtra,
  InvoiceableJob,
} from './build';
import { jobLedger, type ClaimLike } from './claims';
import { jobValue, type JobActuals, type JobValue } from './value';

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

export type JobPricing = 'fixed' | 'costPlus';

/** Hours and receipts actually recorded against each job, keyed by job id. */
export type JobActualsMap = Map<string, JobActuals>;

export const NO_ACTUALS: JobActuals = { minutesWorked: 0, receiptsCents: 0 };

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
  pricing: JobPricing;
  labourRateCents: number;
  markupBasisPoints: number;
  quoteReference?: string;
  /** When the quote was last emailed, if ever. */
  quoteSentAt?: string;
};

/** What a job is worth right now, given what has been logged against it. */
export function valueOf(job: OneOffJob, actuals: JobActualsMap): JobValue {
  return jobValue(job, actuals.get(job.id) ?? NO_ACTUALS);
}

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
  pricing: JobPricing | null;
  labour_rate_cents: number | null;
  markup_basis_points: number | null;
  quote_reference: string | null;
  quote_sent_at: string | null;
};

const JOB_COLUMNS =
  'id, customer_id, property_id, title, description, kind, price_cents, materials_cents, estimated_minutes, status, scheduled_for, completed_on, invoice_id, notes, pricing, labour_rate_cents, markup_basis_points, quote_reference, quote_sent_at';

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
    // Defaults cover a database where migration 0009 has not been run yet.
    pricing: row.pricing ?? 'fixed',
    labourRateCents: row.labour_rate_cents ?? 15_000,
    markupBasisPoints: row.markup_basis_points ?? 0,
    quoteReference: row.quote_reference ?? undefined,
    quoteSentAt: row.quote_sent_at ?? undefined,
  };
}

/**
 * The hours and materials recorded against a customer's jobs.
 *
 * Only cost-plus jobs bill from these, but they are worth showing on a fixed
 * job too — the gap between what you quoted and what it actually cost is the
 * number that tells you whether you are quoting well.
 */
export async function jobActualsFor(customerId: string): Promise<JobActualsMap> {
  const actuals: JobActualsMap = new Map();
  if (!supabaseConfigured) return actuals;

  const supabase = await createClient();
  const { data: jobRows } = await supabase
    .from('one_off_jobs')
    .select('id')
    .eq('customer_id', customerId);

  const jobIds = ((jobRows ?? []) as { id: string }[]).map((row) => row.id);
  if (jobIds.length === 0) return actuals;

  const [hours, receipts] = await Promise.all([
    supabase.from('timesheet_entries').select('job_id, minutes').in('job_id', jobIds),
    supabase.from('receipts').select('job_id, amount_cents').in('job_id', jobIds),
  ]);

  const bump = (jobId: string | null, patch: Partial<JobActuals>) => {
    if (!jobId) return;
    const current = actuals.get(jobId) ?? { minutesWorked: 0, receiptsCents: 0 };
    actuals.set(jobId, {
      minutesWorked: current.minutesWorked + (patch.minutesWorked ?? 0),
      receiptsCents: current.receiptsCents + (patch.receiptsCents ?? 0),
    });
  };

  for (const row of (hours.data ?? []) as { job_id: string | null; minutes: number }[]) {
    bump(row.job_id, { minutesWorked: row.minutes });
  }
  for (const row of (receipts.data ?? []) as {
    job_id: string | null;
    amount_cents: number;
  }[]) {
    bump(row.job_id, { receiptsCents: row.amount_cents });
  }

  return actuals;
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
  claims: ClaimLike[] = [],
  actuals: JobActualsMap = new Map(),
): InvoiceableJob[] {
  return jobs
    .filter((job) => job.status === 'done' && !job.invoiceId && job.completedOn)
    .map((job) => {
      const value = valueOf(job, actuals);
      const ledger = jobLedger({ id: job.id, totalCents: value.totalCents }, claims);

      // No stages billed: the job bills as itself, materials on their own
      // line so the customer can see the split. For cost-plus the "price" is
      // the labour and the margin rides with the materials.
      if (ledger.claimedCents === 0) {
        return {
          jobId: job.id,
          title: job.title,
          propertyLabel: propertyLabel(job.propertyId),
          completedOn: job.completedOn as string,
          priceCents: value.labourCents,
          materialsCents: value.materialsCents + value.markupCents,
        };
      }

      // Stages have been billed, so what is left is a single balance. The
      // price/materials split is meaningless once part of both is paid for.
      return {
        jobId: job.id,
        title: job.title,
        propertyLabel: propertyLabel(job.propertyId),
        completedOn: job.completedOn as string,
        priceCents: ledger.remainingCents,
        materialsCents: 0,
        isBalance: true,
      };
    })
    // A job already covered by its stages needs no final line at all.
    .filter((job) => job.priceCents + job.materialsCents > 0);
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

// ---------------------------------------------------------------------------
// Progress claims
// ---------------------------------------------------------------------------

export type JobClaim = {
  id: string;
  jobId: string;
  description: string;
  amountCents: number;
  claimedOn: string;
  invoiceId?: string;
};

export async function claimsForCustomer(customerId: string): Promise<JobClaim[]> {
  if (!supabaseConfigured) return [];
  const supabase = await createClient();
  // Reached through the jobs, because a claim belongs to a job rather than
  // straight to a customer.
  const { data: jobRows } = await supabase
    .from('one_off_jobs')
    .select('id')
    .eq('customer_id', customerId);

  const jobIds = ((jobRows ?? []) as { id: string }[]).map((row) => row.id);
  if (jobIds.length === 0) return [];

  const { data, error } = await supabase
    .from('job_claims')
    .select('id, job_id, description, amount_cents, claimed_on, invoice_id')
    .in('job_id', jobIds)
    .order('claimed_on', { ascending: true });
  if (error) return [];

  return (
    (data ?? []) as {
      id: string;
      job_id: string;
      description: string;
      amount_cents: number;
      claimed_on: string;
      invoice_id: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    jobId: row.job_id,
    description: row.description,
    amountCents: row.amount_cents,
    claimedOn: row.claimed_on,
    invoiceId: row.invoice_id ?? undefined,
  }));
}

/** The shape lib/invoicing/claims.ts wants. */
export function asClaimLikes(claims: JobClaim[]): ClaimLike[] {
  return claims.map((claim) => ({
    claimId: claim.id,
    jobId: claim.jobId,
    amountCents: claim.amountCents,
    invoiceId: claim.invoiceId,
  }));
}

/** Stages billed but not yet invoiced. These go on the next invoice. */
export function billableClaims(
  claims: JobClaim[],
  jobs: OneOffJob[],
  propertyLabel: (propertyId?: string) => string | undefined,
): InvoiceableClaim[] {
  return claims
    .filter((claim) => !claim.invoiceId)
    .map((claim) => {
      const job = jobs.find((candidate) => candidate.id === claim.jobId);
      return {
        claimId: claim.id,
        jobTitle: job?.title ?? 'Job',
        propertyLabel: propertyLabel(job?.propertyId),
        description: claim.description,
        amountCents: claim.amountCents,
        claimedOn: claim.claimedOn,
      };
    });
}
