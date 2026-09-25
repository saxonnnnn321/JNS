'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, currentStaff } from '@/lib/supabase/server';
import { businessDate } from '@/lib/dates';

/**
 * Logging hours, drawings and income.
 *
 * You may only log hours and drawings against YOURSELF unless you are the
 * owner. That is enforced by the row level security policies in migration
 * 0004, not by this code — a partner should not be able to edit the other
 * one's timesheet, and the database is the only place that rule is safe.
 */

export type FormResult = { error: string } | { ok: true } | null;

const money = z
  .string()
  .trim()
  .transform((value) => value.replace(/[$,\s]/g, ''))
  .pipe(z.coerce.number().min(0.01, 'How much?').max(1_000_000));

const day = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date');

function field(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}

function fail(message: string | undefined, fallback: string): { error: string } {
  if (!message) return { error: fallback };
  if (/row-level security|permission denied/i.test(message)) {
    return { error: 'You can only log that against yourself.' };
  }
  if (/relation .* does not exist/i.test(message)) {
    return { error: 'The timesheet tables are not in the database yet — run migration 0004.' };
  }
  return { error: `${fallback}: ${message}` };
}

export async function logHours(
  _previous: FormResult,
  data: FormData,
): Promise<FormResult> {
  const staff = await currentStaff();
  if (!staff) return { error: 'Not signed in.' };

  const parsed = z
    .object({
      staffId: z.string().uuid().optional().or(z.literal('')),
      workDate: day,
      // Typed as hours because that is how people think about a day's work.
      hours: z.coerce.number().min(0.05, 'How long?').max(24),
      description: z.string().trim().max(300).optional(),
      customerId: z.string().uuid().optional().or(z.literal('')),
      jobId: z.string().uuid().optional().or(z.literal('')),
    })
    .safeParse({
      staffId: field(data, 'staffId'),
      workDate: field(data, 'workDate') || businessDate(),
      hours: field(data, 'hours'),
      description: field(data, 'description'),
      customerId: field(data, 'customerId'),
      jobId: field(data, 'jobId'),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('timesheet_entries').insert({
    staff_id: parsed.data.staffId || staff.id,
    work_date: parsed.data.workDate,
    minutes: Math.round(parsed.data.hours * 60),
    description: parsed.data.description || null,
    customer_id: parsed.data.customerId || null,
    // Hours on a cost-plus job are what it gets billed for, so this is not
    // just a label.
    job_id: parsed.data.jobId || null,
  });

  if (error) return fail(error.message, 'Could not save those hours');

  revalidatePath('/timesheet');
  revalidatePath('/timesheet/split');
  return { ok: true };
}

export async function logDrawing(
  _previous: FormResult,
  data: FormData,
): Promise<FormResult> {
  const staff = await currentStaff();
  if (!staff) return { error: 'Not signed in.' };

  const parsed = z
    .object({
      staffId: z.string().uuid().optional().or(z.literal('')),
      paidOn: day,
      amount: money,
      note: z.string().trim().max(300).optional(),
    })
    .safeParse({
      staffId: field(data, 'staffId'),
      paidOn: field(data, 'paidOn') || businessDate(),
      amount: field(data, 'amount'),
      note: field(data, 'note'),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('partner_drawings').insert({
    staff_id: parsed.data.staffId || staff.id,
    paid_on: parsed.data.paidOn,
    amount_cents: Math.round(parsed.data.amount * 100),
    note: parsed.data.note || null,
  });

  if (error) return fail(error.message, 'Could not save that drawing');

  revalidatePath('/timesheet');
  revalidatePath('/timesheet/split');
  return { ok: true };
}

export async function logIncome(
  _previous: FormResult,
  data: FormData,
): Promise<FormResult> {
  const parsed = z
    .object({
      receivedOn: day,
      amount: money,
      description: z.string().trim().max(300).optional(),
    })
    .safeParse({
      receivedOn: field(data, 'receivedOn') || businessDate(),
      amount: field(data, 'amount'),
      description: field(data, 'description'),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('income_entries').insert({
    received_on: parsed.data.receivedOn,
    amount_cents: Math.round(parsed.data.amount * 100),
    description: parsed.data.description || null,
  });

  if (error) return fail(error.message, 'Could not save that income');

  revalidatePath('/timesheet');
  revalidatePath('/timesheet/split');
  return { ok: true };
}

/** Undo a mistyped row. The database decides whose rows you may remove. */
export async function removeRow(data: FormData): Promise<void> {
  const table = field(data, 'table');
  const id = field(data, 'id');
  const allowed = ['timesheet_entries', 'partner_drawings', 'income_entries'];
  if (!id || !allowed.includes(table)) return;

  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) console.error('could not remove row', table, error);

  revalidatePath('/timesheet');
  revalidatePath('/timesheet/split');
}

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

/** A timer left running overnight is a mistake, not a 14 hour shift. */
const LONG_TIMER_MINUTES = 12 * 60;
const MAX_ENTRY_MINUTES = 24 * 60;

export async function startTimer(
  _previous: FormResult,
  data: FormData,
): Promise<FormResult> {
  const staff = await currentStaff();
  if (!staff) return { error: 'Not signed in.' };

  const description = field(data, 'description').trim().slice(0, 300);
  const customerId = field(data, 'customerId');
  const jobId = field(data, 'jobId');

  const supabase = await createClient();
  // One clock per person. Starting a second replaces the first rather than
  // quietly double-counting the same hour.
  const { error } = await supabase.from('running_timers').upsert(
    {
      staff_id: staff.id,
      started_at: new Date().toISOString(),
      description: description || null,
      customer_id: customerId || null,
      job_id: jobId || null,
    },
    { onConflict: 'staff_id' },
  );

  if (error) return fail(error.message, 'Could not start the clock');

  revalidatePath('/timesheet');
  return { ok: true };
}

export async function stopTimer(
  _previous: FormResult,
  data: FormData,
): Promise<FormResult> {
  const staff = await currentStaff();
  if (!staff) return { error: 'Not signed in.' };

  const supabase = await createClient();
  const { data: timer, error: readError } = await supabase
    .from('running_timers')
    .select('started_at, description, customer_id, job_id')
    .eq('staff_id', staff.id)
    .maybeSingle();

  if (readError) return fail(readError.message, 'Could not find the clock');
  if (!timer) return { error: 'No clock running.' };

  const elapsedMs = Date.now() - new Date(timer.started_at).getTime();
  const minutes = Math.min(
    MAX_ENTRY_MINUTES,
    Math.max(1, Math.round(elapsedMs / 60_000)),
  );

  // Whatever was typed while it ran wins over what it was started with.
  const description = field(data, 'description').trim() || timer.description;

  const { error: insertError } = await supabase.from('timesheet_entries').insert({
    staff_id: staff.id,
    work_date: businessDate(),
    minutes,
    description: description || null,
    customer_id: timer.customer_id,
    job_id: timer.job_id,
  });

  if (insertError) return fail(insertError.message, 'Could not save those hours');

  await supabase.from('running_timers').delete().eq('staff_id', staff.id);

  revalidatePath('/timesheet');
  revalidatePath('/timesheet/split');

  if (minutes >= LONG_TIMER_MINUTES) {
    return {
      error: `Logged ${(minutes / 60).toFixed(1)} hours — that clock had been running a long time. Check it and edit if it was left on.`,
    };
  }
  return { ok: true };
}

/** Started it by mistake. Throws the clock away without logging anything. */
export async function cancelTimer(): Promise<void> {
  const staff = await currentStaff();
  if (!staff) return;
  const supabase = await createClient();
  await supabase.from('running_timers').delete().eq('staff_id', staff.id);
  revalidatePath('/timesheet');
}

// ---------------------------------------------------------------------------
// Fixing a mistake
// ---------------------------------------------------------------------------

export async function updateEntry(
  _previous: FormResult,
  data: FormData,
): Promise<FormResult> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      workDate: day,
      hours: z.coerce.number().min(0.05, 'How long?').max(24),
      description: z.string().trim().max(300).optional(),
      customerId: z.string().uuid().optional().or(z.literal('')),
      jobId: z.string().uuid().optional().or(z.literal('')),
    })
    .safeParse({
      id: field(data, 'id'),
      workDate: field(data, 'workDate'),
      hours: field(data, 'hours'),
      description: field(data, 'description'),
      customerId: field(data, 'customerId'),
      jobId: field(data, 'jobId'),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('timesheet_entries')
    .update({
      work_date: parsed.data.workDate,
      minutes: Math.round(parsed.data.hours * 60),
      description: parsed.data.description || null,
      customer_id: parsed.data.customerId || null,
      job_id: parsed.data.jobId || null,
    })
    .eq('id', parsed.data.id);

  if (error) return fail(error.message, 'Could not save that change');

  revalidatePath('/timesheet');
  revalidatePath('/timesheet/split');
  return { ok: true };
}
