import Link from 'next/link';
import { card, legend } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { formatBusinessDate } from '@/lib/dates';
import { today } from '@/lib/crm/schedule';
import { loadInvoices } from '@/lib/invoicing/queries';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-bark/10 text-bark/60',
  sent: 'bg-leaf-soft text-leaf',
  paid: 'bg-leaf text-white',
  void: 'bg-bark/10 text-bark/40 line-through',
};

export default async function InvoicesPage() {
  const date = today();
  const invoices = await loadInvoices(date);

  const owing = invoices
    .filter((i) => i.status !== 'paid' && i.status !== 'void')
    .reduce((total, i) => total + i.totalCents, 0);
  const overdue = invoices.filter((i) => i.overdue);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <p className="text-sm text-bark/50">
          {formatMoney(owing)} outstanding
          {overdue.length > 0 && (
            <span className="text-amber-800"> · {overdue.length} overdue</span>
          )}
        </p>
      </div>

      {invoices.length === 0 ? (
        <div className={`${card} mt-5`}>
          <p className="font-semibold">No invoices yet.</p>
          <p className="mt-1 text-sm text-bark/60">
            Tick jobs off the run sheet as you finish them, then open a
            customer and press <b>Invoice for work done</b>. Everything they
            owe for gets gathered into one invoice.
          </p>
          <Link
            href="/customers"
            className="mt-3 inline-block rounded-lg bg-leaf px-5 py-2.5 text-sm font-medium text-white hover:bg-leaf/90"
          >
            Go to customers
          </Link>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <Link
                href={`/invoices/${invoice.id}`}
                className={`${card} flex flex-wrap items-baseline gap-x-3 gap-y-1 hover:border-leaf/40`}
              >
                <span className="font-mono text-xs text-bark/50">
                  {invoice.reference}
                </span>
                <span className="font-semibold">{invoice.customerName}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    STATUS_STYLE[invoice.status] ?? 'bg-bark/10'
                  }`}
                >
                  {invoice.status}
                </span>
                {invoice.overdue && (
                  <span className="text-[11px] font-semibold text-amber-800">
                    overdue
                  </span>
                )}
                <span className="ml-auto text-xs text-bark/45">
                  due {formatBusinessDate(invoice.dueDate)}
                </span>
                <span className="w-24 text-right font-semibold text-leaf">
                  {formatMoney(invoice.totalCents)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className={`${legend} mt-8`}>How this works</p>
      <p className={`${card} mt-2 text-sm text-bark/70`}>
        An invoice is built from visits you have ticked off and not yet billed.
        Creating one stamps those visits so the same mow can never be charged
        twice. Nothing is sent automatically — you make it, read it, then send
        it.
      </p>
    </main>
  );
}
