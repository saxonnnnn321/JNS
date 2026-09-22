import { createClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import type { InvoiceDocumentData } from '../pdf/invoice-document';

/** Invoices, read from the database. Server-side only. */

export type InvoiceSummary = {
  id: string;
  reference: string;
  customerId: string;
  customerName: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
  issuedDate: string;
  dueDate: string;
  totalCents: number;
  /** Past its due date and still not paid. Worked out, not stored. */
  overdue: boolean;
};

export type InvoiceDetail = InvoiceSummary & {
  subtotalCents: number;
  gstCents: number;
  customerEmail?: string;
  customerPhone?: string;
  lines: {
    description: string;
    quantity: number;
    unit: string;
    amountCents: number;
  }[];
};

type InvoiceRow = {
  id: string;
  reference: string;
  customer_id: string;
  status: InvoiceSummary['status'];
  issued_date: string;
  due_date: string;
  subtotal_cents: number;
  gst_cents: number;
  total_cents: number;
  customers: { name: string; email: string | null; phone: string | null } | null;
};

/** Supabase returns an embedded row as an object or a one-item array. */
function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function loadInvoices(today: string): Promise<InvoiceSummary[]> {
  if (!supabaseConfigured) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('invoices')
    .select(
      'id, reference, customer_id, status, issued_date, due_date, subtotal_cents, gst_cents, total_cents, customers (name, email, phone)',
    )
    .order('issued_date', { ascending: false })
    .limit(300);

  if (error) {
    console.error('could not read invoices', error);
    return [];
  }

  return ((data ?? []) as unknown as InvoiceRow[]).map((row) => {
    const customer = one(row.customers);
    return {
      id: row.id,
      reference: row.reference,
      customerId: row.customer_id,
      customerName: customer?.name ?? 'Unknown',
      status: row.status,
      issuedDate: row.issued_date,
      dueDate: row.due_date,
      totalCents: row.total_cents,
      overdue:
        row.due_date < today && row.status !== 'paid' && row.status !== 'void',
    };
  });
}

export async function loadInvoice(
  id: string,
  today: string,
): Promise<InvoiceDetail | null> {
  if (!supabaseConfigured) return null;

  const supabase = await createClient();
  const [invoiceResult, itemResult] = await Promise.all([
    supabase
      .from('invoices')
      .select(
        'id, reference, customer_id, status, issued_date, due_date, subtotal_cents, gst_cents, total_cents, customers (name, email, phone)',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('invoice_items')
      .select('description, quantity, unit, amount_cents')
      .eq('invoice_id', id)
      .order('sort'),
  ]);

  if (invoiceResult.error || !invoiceResult.data) return null;

  const row = invoiceResult.data as unknown as InvoiceRow;
  const customer = one(row.customers);

  return {
    id: row.id,
    reference: row.reference,
    customerId: row.customer_id,
    customerName: customer?.name ?? 'Unknown',
    customerEmail: customer?.email ?? undefined,
    customerPhone: customer?.phone ?? undefined,
    status: row.status,
    issuedDate: row.issued_date,
    dueDate: row.due_date,
    subtotalCents: row.subtotal_cents,
    gstCents: row.gst_cents,
    totalCents: row.total_cents,
    overdue:
      row.due_date < today && row.status !== 'paid' && row.status !== 'void',
    lines: (
      (itemResult.data ?? []) as {
        description: string;
        quantity: number | string | null;
        unit: string | null;
        amount_cents: number;
      }[]
    ).map((item) => ({
      description: item.description,
      quantity: Number(item.quantity ?? 1),
      unit: item.unit ?? '',
      amountCents: item.amount_cents,
    })),
  };
}

/** The shape the PDF wants. */
export function toDocument(invoice: InvoiceDetail): InvoiceDocumentData {
  return {
    reference: invoice.reference,
    issuedDate: invoice.issuedDate,
    dueDate: invoice.dueDate,
    customer: {
      name: invoice.customerName,
      email: invoice.customerEmail,
      phone: invoice.customerPhone,
    },
    lines: invoice.lines,
    subtotalCents: invoice.subtotalCents,
    gstCents: invoice.gstCents,
    totalCents: invoice.totalCents,
  };
}
