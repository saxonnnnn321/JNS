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
    })
    .safeParse({
      staffId: field(data, 'staffId'),
      workDate: field(data, 'workDate') || businessDate(),
      hours: field(data, 'hours'),
      description: field(data, 'description'),
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
