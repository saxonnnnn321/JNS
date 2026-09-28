import Link from 'next/link';
import {
  btnPrimary,
  card,
  cardLink,
  EmptyState,
  legend,
  PageHeader,
  StatusTag,
} from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { formatBusinessDate } from '@/lib/dates';
import { today } from '@/lib/crm/schedule';
import { loadInvoices } from '@/lib/invoicing/queries';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const date = today();
  const invoices = await loadInvoices(date);

  const owing = invoices
    .filter((i) => i.status !== 'paid' && i.status !== 'void')
    .reduce((total, i) => total + i.totalCents, 0);
  const overdue = invoices.filter((i) => i.overdue);
  const paid = invoices
    .filter((i) => i.status === 'paid')
    .reduce((total, i) => total + i.totalCents, 0);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:py-8">
      <PageHeader
        title="Invoices"
        sub={
          invoices.length > 0
            ? `${formatMoney(paid)} paid · ${invoices.length} invoice${invoices.length === 1 ? '' : 's'} all up`
            : undefined
        }
        aside={
          invoices.length > 0 && (
            <div className="text-right">
              <p className={legend}>Outstanding</p>
              <p className="tnum font-display text-2xl font-extrabold text-leaf">
                {formatMoney(owing)}
              </p>
              {overdue.length > 0 && (
                <p className="text-xs font-semibold text-amber-800">
                  {overdue.length} overdue
                </p>
              )}
            </div>
          )
        }
      />

      {invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet."
          action={
            <Link href="/customers" className={btnPrimary}>
              Go to customers
            </Link>
          }
        >
          Tick jobs off the run sheet as you finish them, then open a customer
          and press <b>Invoice for work done</b>. Everything they owe for gets
          gathered into one invoice.
        </EmptyState>
      ) : (
        <ul className="mt-5 space-y-2">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <Link
                href={`/invoices/${invoice.id}`}
                className={`${cardLink} flex flex-wrap items-baseline gap-x-3 gap-y-1`}
              >
                <span className="tnum font-mono text-xs text-faint">
                  {invoice.reference}
                </span>
                <span className="font-semibold">{invoice.customerName}</span>
                <StatusTag status={invoice.status} of="invoice" />
                {invoice.overdue && (
                  <span className="text-[11px] font-bold text-amber-800">
                    overdue
                  </span>
                )}
                <span className="ml-auto text-xs text-faint">
                  due {formatBusinessDate(invoice.dueDate)}
                </span>
                <span className="tnum w-24 text-right font-display font-bold text-leaf">
                  {formatMoney(invoice.totalCents)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className={`${legend} mt-8`}>How this works</p>
      <p className={`${card} mt-2 text-sm text-muted`}>
        An invoice is built from visits you have ticked off and not yet billed.
        Creating one stamps those visits so the same mow can never be charged
        twice. Nothing is sent automatically — you make it, read it, then send
        it.
      </p>
    </main>
  );
}
