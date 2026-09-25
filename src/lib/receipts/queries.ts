import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';

/**
 * Receipts, read from the database with a short-lived link to each photo.
 *
 * The photos live in a private bucket, so nothing here stores or returns a
 * permanent URL. Links are signed on the way out and expire — a receipt shows
 * a supplier, a date, an amount and sometimes part of a card number, and a
 * permanent public link to that is a leak waiting to happen.
 *
 * Server-side only.
 */

const LINK_TTL_SECONDS = 10 * 60;

export type Receipt = {
  id: string;
  /** Null when there was no docket — cash for a load of soil. */
  storagePath?: string;
  /** Signed, expires in ten minutes. Null if the link could not be made. */
  photoUrl: string | null;
  supplier?: string;
  amountCents: number;
  purchasedOn: string;
  notes?: string;
  customerId?: string;
  jobId?: string;
  rechargeable: boolean;
  extraId?: string;
  /** True once the line it created has been billed, so it should not change. */
  billed: boolean;
};

type Row = {
  id: string;
  storage_path: string | null;
  supplier: string | null;
  amount_cents: number;
  purchased_on: string;
  notes: string | null;
  customer_id: string | null;
  job_id: string | null;
  rechargeable: boolean;
  extra_id: string | null;
  invoice_extras: { invoice_id: string | null } | { invoice_id: string | null }[] | null;
};

const COLUMNS =
  'id, storage_path, supplier, amount_cents, purchased_on, notes, customer_id, job_id, rechargeable, extra_id, invoice_extras (invoice_id)';

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** `unavailable` distinguishes "migration 0007 not run" from "none yet". */
export type ReceiptList = { receipts: Receipt[]; unavailable: boolean };

export async function loadReceipts(customerId?: string): Promise<ReceiptList> {
  if (!supabaseConfigured) return { receipts: [], unavailable: true };

  const supabase = await createClient();
  let query = supabase
    .from('receipts')
    .select(COLUMNS)
    .order('purchased_on', { ascending: false })
    .limit(300);
  if (customerId) query = query.eq('customer_id', customerId);

  const { data, error } = await query;
  if (error) return { receipts: [], unavailable: true };

  const rows = (data ?? []) as unknown as Row[];

  // One batched call rather than one per receipt, and only for the ones
  // that actually have a photo.
  const paths = rows
    .map((row) => row.storage_path)
    .filter((path): path is string => Boolean(path));
  const links = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from('receipts')
      .createSignedUrls(paths, LINK_TTL_SECONDS);
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) links.set(entry.path, entry.signedUrl);
    }
  }

  return {
    unavailable: false,
    receipts: rows.map((row) => ({
      id: row.id,
      storagePath: row.storage_path ?? undefined,
      photoUrl: row.storage_path ? (links.get(row.storage_path) ?? null) : null,
      supplier: row.supplier ?? undefined,
      amountCents: row.amount_cents,
      purchasedOn: row.purchased_on,
      notes: row.notes ?? undefined,
      customerId: row.customer_id ?? undefined,
      jobId: row.job_id ?? undefined,
      rechargeable: row.rechargeable,
      extraId: row.extra_id ?? undefined,
      billed: Boolean(one(row.invoice_extras)?.invoice_id),
    })),
  };
}

/** What the business has spent over a period, for the books. */
export function spendBetween(
  receipts: Receipt[],
  from: string,
  to: string,
): { totalCents: number; rechargeableCents: number; overheadCents: number } {
  const inRange = receipts.filter(
    (receipt) => receipt.purchasedOn >= from && receipt.purchasedOn <= to,
  );
  const rechargeableCents = inRange
    .filter((receipt) => receipt.rechargeable && receipt.customerId)
    .reduce((total, receipt) => total + receipt.amountCents, 0);
  const totalCents = inRange.reduce(
    (total, receipt) => total + receipt.amountCents,
    0,
  );
  return {
    totalCents,
    rechargeableCents,
    overheadCents: totalCents - rechargeableCents,
  };
}
