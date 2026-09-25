'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { businessDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { actualsFor, NO_ACTUALS } from '@/lib/invoicing/jobs';
import { jobValue } from '@/lib/invoicing/value';
import { checkClaim } from '@/lib/invoicing/claims';

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

/** One press from a customer's page: mark it finished today. */
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
  // A dynamic child is not covered by revalidating the list, so the customer
  // whose job this is has to be named.
  const customerId = field(data, 'customerId');
  if (customerId) revalidatePath(`/customers/${customerId}`);
  revalidatePath('/customers');
}

/**
 * Move a job one step along the board.
 *
 * Quoted → Booked in → Started → Finished, one press per step. The board only
 * ever offers the next step, so a job cannot arrive at "finished" without
 * having been agreed and started, and the completion date is only stamped on
 * the step that earns it.
 */
export async function advanceJob(data: FormData): Promise<void> {
  const id = field(data, 'id');
  const to = field(data, 'to');
  const customerId = field(data, 'customerId');
  if (!id) return;

  const next = z.enum(['scheduled', 'in_progress', 'done']).safeParse(to);
  if (!next.success) return;

  const patch: Record<string, string | null> = { status: next.data };
  if (next.data === 'done') {
    patch.completed_on = businessDate();
  } else {
    // Stepping back off "finished" must clear the date, or the job stays
    // billable-looking with a completion it no longer has.
    patch.completed_on = null;
  }
  if (next.data === 'scheduled') {
    // Agreed today unless a date was already set when it was quoted.
    const booked = await bookingDateOf(id);
    if (!booked) patch.scheduled_for = businessDate();
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('one_off_jobs')
    .update(patch)
    .eq('id', id)
    .is('invoice_id', null);
  if (error) console.error('could not move the job on', error);

  revalidatePath('/jobs');
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

/** The booking date already on a job, if any. */
async function bookingDateOf(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('one_off_jobs')
    .select('scheduled_for')
    .eq('id', id)
    .maybeSingle();
  return (data as { scheduled_for: string | null } | null)?.scheduled_for ?? null;
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
 *
 * "What the job is worth" has to come from `jobValue`, not from the price
 * column. A cost-plus job has no price — its worth is the hours logged and the
 * receipts filed — so reading the column made every cost-plus job worth $0 and
 * refused every stage on it. Billing a big cost-plus job in stages is the
 * whole reason progress claims exist.
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
    .select(
      'price_cents, materials_cents, invoice_id, pricing, labour_rate_cents, markup_basis_points',
    )
    .eq('id', input.jobId)
    .maybeSingle();
  if (jobError || !job) return fail(jobError?.message, 'Could not find that job');
  if (job.invoice_id) {
    return { error: 'That job has already been invoiced in full.' };
  }

  const row = job as {
    price_cents: number;
    materials_cents: number;
    pricing: 'fixed' | 'costPlus' | null;
    labour_rate_cents: number | null;
    markup_basis_points: number | null;
  };

  const [{ data: existing }, actuals] = await Promise.all([
    supabase.from('job_claims').select('amount_cents').eq('job_id', input.jobId),
    actualsFor([input.jobId]),
  ]);

  const alreadyClaimed = ((existing ?? []) as { amount_cents: number }[]).reduce(
    (total, claimed) => total + claimed.amount_cents,
    0,
  );

  const value = jobValue(
    {
      pricing: row.pricing ?? 'fixed',
      priceCents: row.price_cents,
      materialsCents: row.materials_cents,
      labourRateCents: row.labour_rate_cents ?? 15_000,
      markupBasisPoints: row.markup_basis_points ?? 0,
    },
    actuals.get(input.jobId) ?? NO_ACTUALS,
  );
  const check = checkClaim({ value, claimedCents: alreadyClaimed, amountCents });
  if (!check.ok) {
    return {
      error:
        check.reason === 'nothingLogged'
          ? 'Nothing is logged against this cost-plus job yet, so there is nothing to claim. Log the hours or file the receipts first.'
          : `Only ${formatMoney(check.remainingCents)} is left unclaimed on this job${
              value.isCostPlus
                ? ' — that is what has been logged against it so far'
                : ''
            }.`,
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

// ---------------------------------------------------------------------------
// Sending the quote
// ---------------------------------------------------------------------------

export type SendQuoteResult = { error: string } | { ok: string } | null;

/**
 * Email the quote for a job, with the PDF attached, and remember that it
 * went. Refuses rather than embarrasses you when there is no email on file.
 */
export async function emailJobQuote(
  _previous: SendQuoteResult,
  data: FormData,
): Promise<SendQuoteResult> {
  const id = field(data, 'id');
  if (!id) return { error: 'No job.' };

  const { loadJobQuote } = await import('@/lib/invoicing/job-quote');
  const { renderJobQuotePdf } = await import('@/lib/pdf/render-job-quote');
  const { quoteBody, quoteSubject } = await import('@/lib/email/compose');
  const { sendEmail, EmailError } = await import('@/lib/email/send');

  const quote = await loadJobQuote(id);
  if (!quote) return { error: 'Could not find that job.' };
  if (!quote.customerEmail) {
    return {
      error: `No email address on file for ${quote.customer.name}. Add one on their page.`,
    };
  }

  const shape = {
    reference: quote.reference,
    customerName: quote.customer.name,
    title: quote.title,
    totalCents: quote.totalCents,
    validUntil: quote.validUntil,
    isCostPlus: quote.isCostPlus,
    labourRateCents: quote.labourRateCents,
  };

  try {
    const pdf = await renderJobQuotePdf(quote);
    await sendEmail({
      to: quote.customerEmail,
      subject: quoteSubject(shape),
      text: quoteBody(shape),
      attachments: [{ filename: `${quote.reference}.pdf`, content: pdf }],
    });
  } catch (cause) {
    if (cause instanceof EmailError) return { error: cause.message };
    console.error('could not send the quote', cause);
    return { error: 'Could not send it. Check the logs.' };
  }

  const supabase = await createClient();
  await supabase
    .from('one_off_jobs')
    .update({ quote_sent_at: new Date().toISOString() })
    .eq('id', id);

  revalidatePath('/jobs');
  revalidatePath(`/customers/${quote.customerId}`);
  return { ok: `Quote sent to ${quote.customerEmail}` };
}
