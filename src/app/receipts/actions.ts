'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { businessDate } from '@/lib/dates';

/**
 * Saving a receipt.
 *
 * The photo is uploaded straight from the phone to Supabase Storage before
 * this runs, and only the path arrives here. That is deliberate: sending the
 * image through a server action would put it in the request body, and Vercel
 * rejects bodies over 4.5 MB at the infrastructure layer, before any of this
 * code gets a say. Uploading direct also means a slow connection is retrying
 * one photo rather than the whole form.
 *
 * A rechargeable receipt against a customer also creates the invoice line, so
 * the material you bought this morning is on their next bill without anyone
 * having to remember it.
 */

export type ReceiptResult = { error: string } | null;

const dollars = z
  .string()
  .trim()
  .transform((value) => value.replace(/[$,\s]/g, ''))
  .pipe(z.coerce.number().min(0.01, 'How much was it?').max(1_000_000));

function field(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}

function fail(message: string | undefined, fallback: string): ReceiptResult {
  if (!message) return { error: fallback };
  if (/relation .* does not exist/i.test(message)) {
    return { error: 'The receipts table is not in the database yet — run migration 0007.' };
  }
  if (/row-level security|permission denied/i.test(message)) {
    return { error: 'Your account is not allowed to do that.' };
  }
  return { error: `${fallback}: ${message}` };
}

const schema = z.object({
  storagePath: z.string().trim().min(1, 'The photo did not upload'),
  supplier: z.string().trim().max(120).optional(),
  amount: dollars,
  purchasedOn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  notes: z.string().trim().max(500).optional(),
  customerId: z.string().uuid().optional().or(z.literal('')),
  jobId: z.string().uuid().optional().or(z.literal('')),
  rechargeable: z.enum(['on', '']).optional(),
});

export async function saveReceipt(
  _previous: ReceiptResult,
  data: FormData,
): Promise<ReceiptResult> {
  const parsed = schema.safeParse({
    storagePath: field(data, 'storagePath'),
    supplier: field(data, 'supplier'),
    amount: field(data, 'amount'),
    purchasedOn: field(data, 'purchasedOn') || businessDate(),
    notes: field(data, 'notes'),
    customerId: field(data, 'customerId'),
    jobId: field(data, 'jobId'),
    rechargeable: field(data, 'rechargeable') === 'on' ? 'on' : '',
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form' };
  }
  const input = parsed.data;
  const amountCents = Math.round(input.amount * 100);

  // Charging it back only means anything if you said who to charge.
  const rechargeable = input.rechargeable === 'on' && Boolean(input.customerId);
  if (input.rechargeable === 'on' && !input.customerId) {
    return { error: 'Pick who to charge it to, or untick "charge to customer".' };
  }

  const supabase = await createClient();

  let extraId: string | null = null;
  if (rechargeable) {
    const { data: extra, error } = await supabase
      .from('invoice_extras')
      .insert({
        customer_id: input.customerId,
        description: input.supplier
          ? `${input.supplier}${input.notes ? ` — ${input.notes}` : ''}`
          : (input.notes || 'Materials'),
        amount_cents: amountCents,
        incurred_on: input.purchasedOn,
      })
      .select('id')
      .single();
    if (error || !extra) return fail(error?.message, 'Could not add the charge');
    extraId = extra.id;
  }

  const { error } = await supabase.from('receipts').insert({
    storage_path: input.storagePath,
    supplier: input.supplier || null,
    amount_cents: amountCents,
    purchased_on: input.purchasedOn,
    notes: input.notes || null,
    customer_id: input.customerId || null,
    job_id: input.jobId || null,
    rechargeable,
    extra_id: extraId,
  });

  if (error) {
    // Do not leave a charge behind for a receipt that failed to save.
    if (extraId) await supabase.from('invoice_extras').delete().eq('id', extraId);
    return fail(error.message, 'Could not save the receipt');
  }

  revalidatePath('/receipts');
  if (input.customerId) revalidatePath(`/customers/${input.customerId}`);
  return null;
}

/**
 * Binning one. Takes the photo and any uninvoiced charge with it — a receipt
 * deleted while its charge lived on would quietly bill a customer for
 * something with no evidence behind it.
 */
export async function deleteReceipt(data: FormData): Promise<void> {
  const id = field(data, 'id');
  if (!id) return;

  const supabase = await createClient();
  const { data: receipt } = await supabase
    .from('receipts')
    .select('storage_path, customer_id, extra_id')
    .eq('id', id)
    .maybeSingle();

  if (receipt?.extra_id) {
    await supabase
      .from('invoice_extras')
      .delete()
      .eq('id', receipt.extra_id)
      .is('invoice_id', null);
  }

  const { error } = await supabase.from('receipts').delete().eq('id', id);
  if (error) {
    console.error('could not delete the receipt', error);
    return;
  }

  if (receipt?.storage_path) {
    await supabase.storage.from('receipts').remove([receipt.storage_path]);
  }

  revalidatePath('/receipts');
  if (receipt?.customer_id) revalidatePath(`/customers/${receipt.customer_id}`);
}
