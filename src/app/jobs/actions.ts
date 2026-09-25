'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { businessDate } from '@/lib/dates';

/**
 * One-off jobs: construction, cleanups, anything that is not the round.
 *
 * A job carries its own price, agreed up front, and only becomes billable
 * once it is marked done. That is deliberate — half-finished work should not
 * be able to land on an invoice.
 */

export type JobResult = { error: string } | null;

const dollars = z
  .string()
  .trim()
  .transform((value) => value.replace(/[$,\s]/g, ''))
  .pipe(z.coerce.number().min(0).max(1_000_000));

const day = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

function field(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}

function fail(message: string | undefined, fallback: string): JobResult {
  if (!message) return { error: fallback };
  if (/relation .* does not exist/i.test(message)) {
    return { error: 'The jobs table is not in the database yet — run migration 0006.' };
  }
  if (/row-level security|permission denied/i.test(message)) {
    return { error: 'Your account is not allowed to do that.' };
  }
  return { error: `${fallback}: ${message}` };
}

const jobFields = z.object({
  customerId: z.string().uuid(),
  propertyId: z.string().uuid().optional().or(z.literal('')),
  title: z.string().trim().min(1, 'Give the job a name'),
  description: z.string().trim().max(2000).optional(),
  kind: z.enum(['construction', 'landscaping', 'cleanup', 'maintenance', 'other']),
  price: dollars,
  materials: dollars,
  estimatedMinutes: z
    .union([z.coerce.number().int().min(0).max(100_000), z.literal('')])
    .optional(),
  status: z.enum(['quoted', 'scheduled', 'in_progress', 'done', 'cancelled']),
  pricing: z.enum(['fixed', 'costPlus']),
  labourRate: dollars,
  markupPercent: z.coerce.number().min(0).max(100),
  scheduledFor: z.union([day, z.literal('')]).optional(),
  completedOn: z.union([day, z.literal('')]).optional(),
  notes: z.string().trim().max(1000).optional(),
});

function read(data: FormData) {
  return {
    customerId: field(data, 'customerId'),
    propertyId: field(data, 'propertyId'),
    title: field(data, 'title'),
    description: field(data, 'description'),
    kind: field(data, 'kind') || 'construction',
    price: field(data, 'price') || '0',
    materials: field(data, 'materials') || '0',
    estimatedMinutes: field(data, 'estimatedMinutes') || '',
    status: field(data, 'status') || 'quoted',
    pricing: field(data, 'pricing') || 'fixed',
    labourRate: field(data, 'labourRate') || '150',
    markupPercent: field(data, 'markupPercent') || '0',
    scheduledFor: field(data, 'scheduledFor') || '',
    completedOn: field(data, 'completedOn') || '',
    notes: field(data, 'notes'),
  };
}

function payload(input: z.infer<typeof jobFields>) {
  // Marking something done without saying when makes it unbillable, so fill
  // today in rather than leaving a job that can never be invoiced.
  const completedOn =
    input.status === 'done' ? input.completedOn || businessDate() : null;

  return {
    property_id: input.propertyId || null,
    pricing: input.pricing,
    labour_rate_cents: Math.round(input.labourRate * 100),
    // Percent in the form, basis points in the database: 15% -> 1500.
    markup_basis_points: Math.round(input.markupPercent * 100),
    title: input.title,
    description: input.description || null,
    kind: input.kind,
    price_cents: Math.round(input.price * 100),
    materials_cents: Math.round(input.materials * 100),
    estimated_minutes:
      typeof input.estimatedMinutes === 'number' ? input.estimatedMinutes : null,
    status: input.status,
    scheduled_for: input.scheduledFor || null,
    completed_on: completedOn,
    notes: input.notes || null,
  };
}

export async function addJob(
  _previous: JobResult,
  data: FormData,
): Promise<JobResult> {
  const parsed = jobFields.safeParse(read(data));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('one_off_jobs').insert({
    customer_id: parsed.data.customerId,
    ...payload(parsed.data),
  });
  if (error) return fail(error.message, 'Could not save the job');

  revalidatePath('/jobs');
  revalidatePath(`/customers/${parsed.data.customerId}`);
  return null;
}

export async function updateJob(
  _previous: JobResult,
  data: FormData,
): Promise<JobResult> {
  const parsed = jobFields
    .extend({ id: z.string().uuid() })
    .safeParse({ ...read(data), id: field(data, 'id') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('one_off_jobs')
    .update(payload(parsed.data))
    .eq('id', parsed.data.id)
    // An invoiced job is history. Changing its price would silently
    // disagree with the bill the customer already has.
    .is('invoice_id', null);
  if (error) return fail(error.message, 'Could not save the job');

  revalidatePath('/jobs');
  revalidatePath(`/customers/${parsed.data.customerId}`);
  return null;
}

/** One press from the jobs board: mark it finished today. */
export async function finishJob(data: FormData): Promise<void> {
  const id = field(data, 'id');
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from('one_off_jobs')
    .update({ status: 'done', completed_on: businessDate() })
    .eq('id', id)
    .is('invoice_id', null);
  if (error) console.error('could not finish the job', error);

  revalidatePath('/jobs');
  revalidatePath('/customers');
}

export async function removeJob(data: FormData): Promise<void> {
  const id = field(data, 'id');
  const customerId = field(data, 'customerId');
  if (!id) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from('one_off_jobs')
    .delete()
    .eq('id', id)
    .is('invoice_id', null);
  if (error) console.error('could not remove the job', error);

  revalidatePath('/jobs');
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

// ---------------------------------------------------------------------------
// Extra invoice lines
// ---------------------------------------------------------------------------

export async function addExtra(
  _previous: JobResult,
  data: FormData,
): Promise<JobResult> {
  const parsed = z
    .object({
      customerId: z.string().uuid(),
      description: z.string().trim().min(1, 'What is it for?'),
      // Negative is allowed: that is how a discount is entered.
      amount: z
        .string()
        .trim()
        .transform((value) => value.replace(/[$,\s]/g, ''))
        .pipe(z.coerce.number().min(-1_000_000).max(1_000_000)),
      incurredOn: day,
    })
    .safeParse({
      customerId: field(data, 'customerId'),
      description: field(data, 'description'),
      amount: field(data, 'amount'),
      incurredOn: field(data, 'incurredOn') || businessDate(),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form' };
  }
  if (parsed.data.amount === 0) return { error: 'Zero is not worth a line.' };

  const supabase = await createClient();
  const { error } = await supabase.from('invoice_extras').insert({
    customer_id: parsed.data.customerId,
    description: parsed.data.description,
    amount_cents: Math.round(parsed.data.amount * 100),
    incurred_on: parsed.data.incurredOn,
  });
  if (error) return fail(error.message, 'Could not add that line');

  revalidatePath(`/customers/${parsed.data.customerId}`);
  return null;
}

export async function removeExtra(data: FormData): Promise<void> {
  const id = field(data, 'id');
  const customerId = field(data, 'customerId');
  if (!id) return;
  const supabase = await createClient();
  await supabase.from('invoice_extras').delete().eq('id', id).is('invoice_id', null);
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

// ---------------------------------------------------------------------------
// Progress claims — billing a big job in stages
// ---------------------------------------------------------------------------

/**
 * Claim an amount against a job before it is finished.
 *
 * Refuses to claim more than the job is worth. Over-claiming is a typo, and
 * the alternative to catching it here is an invoice that hands money back.
 */
export async function addClaim(
  _previous: JobResult,
  data: FormData,
): Promise<JobResult> {
  const parsed = z
    .object({
      jobId: z.string().uuid(),
      customerId: z.string().uuid(),
      description: z.string().trim().min(1, 'What is the stage?'),
      amount: dollars.pipe(z.number().min(0.01, 'How much?')),
      claimedOn: day,
    })
    .safeParse({
      jobId: field(data, 'jobId'),
      customerId: field(data, 'customerId'),
      description: field(data, 'description'),
      amount: field(data, 'amount'),
      claimedOn: field(data, 'claimedOn') || businessDate(),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form' };
  }
  const input = parsed.data;
  const amountCents = Math.round(input.amount * 100);

  const supabase = await createClient();

  const { data: job, error: jobError } = await supabase
    .from('one_off_jobs')
    .select('price_cents, materials_cents, invoice_id')
    .eq('id', input.jobId)
    .maybeSingle();
  if (jobError || !job) return fail(jobError?.message, 'Could not find that job');
  if (job.invoice_id) {
    return { error: 'That job has already been invoiced in full.' };
  }

  const { data: existing } = await supabase
    .from('job_claims')
    .select('amount_cents')
    .eq('job_id', input.jobId);

  const alreadyClaimed = ((existing ?? []) as { amount_cents: number }[]).reduce(
    (total, row) => total + row.amount_cents,
    0,
  );
  const total = job.price_cents + job.materials_cents;
  const remaining = total - alreadyClaimed;

  if (amountCents > remaining) {
    return {
      error: `Only ${(remaining / 100).toLocaleString('en-AU', {
        style: 'currency',
        currency: 'AUD',
      })} is left unclaimed on this job.`,
    };
  }

  const { error } = await supabase.from('job_claims').insert({
    job_id: input.jobId,
    description: input.description,
    amount_cents: amountCents,
    claimed_on: input.claimedOn,
  });
  if (error) return fail(error.message, 'Could not add the claim');

  revalidatePath('/jobs');
  revalidatePath(`/customers/${input.customerId}`);
  return null;
}

export async function removeClaim(data: FormData): Promise<void> {
  const id = field(data, 'id');
  const customerId = field(data, 'customerId');
  if (!id) return;
  const supabase = await createClient();
  // An invoiced stage is history and stays put.
  await supabase.from('job_claims').delete().eq('id', id).is('invoice_id', null);
  revalidatePath('/jobs');
  if (customerId) revalidatePath(`/customers/${customerId}`);
}
