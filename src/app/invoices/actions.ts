'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadRound } from '@/lib/crm/queries';
import { buildInvoice, formatInvoiceReference } from '@/lib/invoicing/build';
import { invoiceableVisitsFor } from '@/lib/invoicing/collect';
import {
  billableExtras,
  billableJobs,
  extrasForCustomer,
  jobsForCustomer,
} from '@/lib/invoicing/jobs';
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

  const [round, jobs, extras] = await Promise.all([
    loadRound(),
    jobsForCustomer(customerId),
    extrasForCustomer(customerId),
  ]);

  const visits = invoiceableVisitsFor(round, customerId);
  const labelFor = (propertyId?: string) => {
    const property = propertyId ? round.propertyById(propertyId) : undefined;
    return property ? `${property.addressLine}, ${property.suburb}` : undefined;
  };
  const doneJobs = billableJobs(jobs, labelFor);
  const openExtras = billableExtras(extras);

  if (visits.length === 0 && doneJobs.length === 0 && openExtras.length === 0) {
    redirect(`/customers/${customerId}?invoice=nothing`);
  }

  const built = buildInvoice({
    visits,
    jobs: doneJobs,
    extras: openExtras,
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

  // Stamp everything this invoice covers, so none of it can be billed twice.
  const stamps = await Promise.all([
    built.visitIds.length
      ? supabase.from('visits').update({ invoice_id: invoiceId }).in('id', built.visitIds)
      : null,
    built.jobIds.length
      ? supabase
          .from('one_off_jobs')
          .update({ invoice_id: invoiceId })
          .in('id', built.jobIds)
      : null,
    built.extraIds.length
      ? supabase
          .from('invoice_extras')
          .update({ invoice_id: invoiceId })
          .in('id', built.extraIds)
      : null,
  ]);
  for (const stamp of stamps) {
    if (stamp?.error) console.error('could not stamp billed work', stamp.error);
  }

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
  // Release everything it covered, or the work would be swallowed for good.
  await Promise.all([
    supabase.from('visits').update({ invoice_id: null }).eq('invoice_id', id),
    supabase.from('one_off_jobs').update({ invoice_id: null }).eq('invoice_id', id),
    supabase.from('invoice_extras').update({ invoice_id: null }).eq('invoice_id', id),
  ]);
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) {
    console.error('could not delete the invoice', error);
    redirect(`/invoices/${id}?error=delete`);
  }

  revalidatePath('/invoices');
  redirect('/invoices');
}

// ---------------------------------------------------------------------------
// Sending it
// ---------------------------------------------------------------------------

export type SendResult = { error: string } | { ok: string } | null;

/**
 * Email the invoice, with the PDF attached.
 *
 * Refuses rather than sends when something would embarrass you in front of a
 * customer: no email on file, or an ABN that fails its checksum. Those are
 * cheap to fix now and expensive to fix after the fact.
 */
export async function emailInvoice(
  _previous: SendResult,
  data: FormData,
): Promise<SendResult> {
  const id = field(data, 'id');
  if (!id) return { error: 'No invoice.' };

  const { loadInvoice, toDocument } = await import('@/lib/invoicing/queries');
  const { renderInvoicePdf } = await import('@/lib/pdf/render-invoice');
  const { invoiceBody, invoiceSubject } = await import('@/lib/email/compose');
  const { sendEmail, EmailError } = await import('@/lib/email/send');
  const { isValidAbn } = await import('@/lib/abn');
  const { today } = await import('@/lib/crm/schedule');

  const invoice = await loadInvoice(id, today());
  if (!invoice) return { error: 'Invoice not found.' };
  if (!invoice.customerEmail) {
    return {
      error: `No email address on file for ${invoice.customerName}. Add one on their customer page.`,
    };
  }
  if (!isValidAbn(BUSINESS.abn)) {
    return {
      error:
        'Your ABN does not pass the checksum, so this will not go out. Fix it before sending anything.',
    };
  }

  const shape = {
    reference: invoice.reference,
    customerName: invoice.customerName,
    totalCents: invoice.totalCents,
    dueDate: invoice.dueDate,
    gstRegistered: BUSINESS.gstRegistered,
  };

  try {
    const pdf = await renderInvoicePdf(toDocument(invoice));
    await sendEmail({
      to: invoice.customerEmail,
      subject: invoiceSubject(shape),
      text: invoiceBody(shape),
      attachments: [{ filename: `${invoice.reference}.pdf`, content: pdf }],
    });
  } catch (cause) {
    if (cause instanceof EmailError) return { error: cause.message };
    console.error('could not send the invoice', cause);
    return { error: 'Could not send it. Check the logs.' };
  }

  const supabase = await createClient();
  await supabase.from('invoices').update({ status: 'sent' }).eq('id', id);

  revalidatePath('/invoices');
  revalidatePath(`/invoices/${id}`);
  return { ok: `Sent to ${invoice.customerEmail}` };
}
