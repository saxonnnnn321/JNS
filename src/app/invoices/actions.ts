'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadRound } from '@/lib/crm/queries';
import { buildInvoice, formatInvoiceReference } from '@/lib/invoicing/build';
import { invoiceableVisitsFor } from '@/lib/invoicing/collect';
import { BUSINESS } from '@/lib/business';
import { addDays, businessDate } from '@/lib/dates';

/**
 * Creating an invoice from work already done.
 *
 * Nothing is sent from here. This produces a DRAFT — you look at it, then
 * decide. An invoice reaching a customer before a human has read it is a
 * phone call nobody wants.
 */

function field(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}

export async function invoiceCustomer(data: FormData): Promise<void> {
  const customerId = field(data, 'customerId');
  if (!customerId) return;

  const round = await loadRound();
  const visits = invoiceableVisitsFor(round, customerId);
  if (visits.length === 0) {
    redirect(`/customers/${customerId}?invoice=nothing`);
  }

  const built = buildInvoice({
    visits,
    gstRegistered: BUSINESS.gstRegistered,
    gstRate: BUSINESS.gstRate,
  });

  const supabase = await createClient();

  // Sequence from what is already there. Two people invoicing in the same
  // second would collide on the unique reference, so fall back to a
  // timestamped one rather than failing in someone's face.
  const { count } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true });
  const issued = businessDate();

  const base = {
    customer_id: customerId,
    property_id: round.plansFor(customerId)[0]?.propertyId ?? null,
    status: 'draft',
    issued_date: issued,
    due_date: addDays(issued, BUSINESS.payment.termsDays),
    subtotal_cents: built.subtotalCents,
    gst_cents: built.gstCents,
    total_cents: built.totalCents,
  };

  let invoiceId: string | null = null;
  for (const reference of [
    formatInvoiceReference((count ?? 0) + 1),
    `INV-${Date.now().toString().slice(-8)}`,
  ]) {
    const { data: created, error } = await supabase
      .from('invoices')
      .insert({ ...base, reference })
      .select('id')
      .single();
    if (!error && created) {
      invoiceId = created.id;
      break;
    }
    if (error && !/duplicate key/i.test(error.message)) {
      console.error('could not create the invoice', error);
      redirect(`/customers/${customerId}?invoice=failed`);
    }
  }

  if (!invoiceId) redirect(`/customers/${customerId}?invoice=failed`);

  const { error: itemError } = await supabase.from('invoice_items').insert(
    built.lines.map((line) => ({
      invoice_id: invoiceId,
      sort: line.sort,
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      amount_cents: line.amountCents,
    })),
  );
  if (itemError) console.error('could not save the invoice lines', itemError);

  // Stamp the visits so they can never be billed a second time.
  const { error: stampError } = await supabase
    .from('visits')
    .update({ invoice_id: invoiceId })
    .in('id', built.visitIds);
  if (stampError) console.error('could not stamp the visits', stampError);

  revalidatePath('/invoices');
  revalidatePath(`/customers/${customerId}`);
  redirect(`/invoices/${invoiceId}`);
}

export async function setInvoiceStatus(data: FormData): Promise<void> {
  const id = field(data, 'id');
  const status = field(data, 'status');
  if (!id || !['draft', 'sent', 'paid', 'void'].includes(status)) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from('invoices')
    .update({
      status,
      paid_at: status === 'paid' ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (error) console.error('could not update the invoice', error);

  revalidatePath('/invoices');
  revalidatePath(`/invoices/${id}`);
}

/**
 * Cancelling a draft. The visits go back in the pool so they can be billed
 * again — otherwise a mistaken invoice would swallow the work permanently.
 */
export async function deleteInvoice(data: FormData): Promise<void> {
  const id = field(data, 'id');
  if (!id) return;

  const supabase = await createClient();
  await supabase.from('visits').update({ invoice_id: null }).eq('invoice_id', id);
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) {
    console.error('could not delete the invoice', error);
    redirect(`/invoices/${id}?error=delete`);
  }

  revalidatePath('/invoices');
  redirect('/invoices');
}
