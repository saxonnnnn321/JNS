import Link from 'next/link';
import { notFound } from 'next/navigation';
import { card, legend } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { formatBusinessDate } from '@/lib/dates';
import { today } from '@/lib/crm/schedule';
import { loadInvoice } from '@/lib/invoicing/queries';
import { BUSINESS, hasBankDetails } from '@/lib/business';
import { isValidAbn } from '@/lib/abn';
import { deleteInvoice, setInvoiceStatus } from '../actions';
import { SendButton } from '../send-button';
import { emailConfigured } from '@/lib/email/env';

export const dynamic = 'force-dynamic';

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const invoice = await loadInvoice(id, today());
  if (!invoice) notFound();

  const gst = BUSINESS.gstRegistered;
  // A checksum, not a placeholder check — this catches a transposed digit too.
  const abnLooksWrong = !isValidAbn(BUSINESS.abn);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/invoices" className="text-sm text-bark/50 hover:text-bark">
        ← Invoices
      </Link>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">
          {gst ? 'Tax invoice' : 'Invoice'}{' '}
          <span className="font-mono text-base text-bark/40">
            {invoice.reference}
          </span>
        </h1>
        <span className="text-2xl font-bold text-leaf">
          {formatMoney(invoice.totalCents)}
        </span>
      </div>
      <p className="mt-1 text-sm text-bark/60">
        <Link href={`/customers/${invoice.customerId}`} className="hover:text-leaf">
          {invoice.customerName}
        </Link>{' '}
        · issued {formatBusinessDate(invoice.issuedDate)} · due{' '}
        {formatBusinessDate(invoice.dueDate)}
        {invoice.overdue && (
          <span className="font-semibold text-amber-800"> · overdue</span>
        )}
      </p>

      {abnLooksWrong && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <b>{BUSINESS.abn}</b> does not pass the ABN checksum. Do not send
          this — a customer who cannot match your ABN to the register is
          legally required to withhold 47% of the payment.
        </p>
      )}

      {!hasBankDetails && (
        <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          No bank account set yet, so the PDF carries no payment details at all
          — the customer gets a bill with no way to pay it and has to ring you.
          Send me the BSB and account number once the business account is open
          and every invoice from then on prints them.
        </p>
      )}

      <section className={`${card} mt-5`}>
        <p className={legend}>Work done</p>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {invoice.lines.map((line, index) => (
              <tr key={index} className="border-t border-black/5">
                <td className="py-2 pr-3">{line.description}</td>
                <td className="py-2 pr-3 text-right text-bark/50">
                  {line.quantity} {line.unit}
                </td>
                <td className="py-2 text-right font-medium">
                  {formatMoney(line.amountCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-bark/60">{gst ? 'Subtotal (ex GST)' : 'Subtotal'}</span>
            <span>{formatMoney(invoice.subtotalCents)}</span>
          </div>
          {gst && (
            <div className="flex justify-between">
              <span className="text-bark/60">GST 10%</span>
              <span>{formatMoney(invoice.gstCents)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-black/10 pt-1 font-bold text-leaf">
            <span>Total due</span>
            <span>{formatMoney(invoice.totalCents)}</span>
          </div>
        </div>
        {!gst && (
          <p className="mt-3 text-xs text-bark/45">
            No GST charged — not registered. This is an &ldquo;Invoice&rdquo;,
            not a &ldquo;Tax invoice&rdquo;, which is what the law requires
            when you are not registered.
          </p>
        )}
      </section>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {/* `download` matters: without it the browser navigates to the PDF
            instead of saving it, and a phone that cannot render one inline
            just shows a blank page. */}
        <a
          href={`/api/invoice/${invoice.id}/pdf`}
          download={`${invoice.reference}.pdf`}
          className="rounded-lg bg-leaf px-5 py-2.5 text-sm font-medium text-white hover:bg-leaf/90"
        >
          Download PDF
        </a>
        <a
          href={`/api/invoice/${invoice.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-black/15 px-4 py-2 text-sm hover:border-leaf"
        >
          View it
        </a>

        {(['draft', 'sent', 'paid'] as const)
          .filter((status) => status !== invoice.status)
          .map((status) => (
            <form key={status} action={setInvoiceStatus}>
              <input type="hidden" name="id" value={invoice.id} />
              <input type="hidden" name="status" value={status} />
              <button
                type="submit"
                className="rounded-lg border border-leaf px-4 py-2 text-sm font-medium text-leaf hover:bg-leaf-soft"
              >
                Mark {status}
              </button>
            </form>
          ))}

        {!emailConfigured && invoice.customerEmail && (
          <a
            href={`mailto:${invoice.customerEmail}?subject=${encodeURIComponent(
              `${BUSINESS.tradingName} — ${gst ? 'Tax invoice' : 'Invoice'} ${invoice.reference}`,
            )}&body=${encodeURIComponent(
              `Hi ${invoice.customerName},\n\nAttached is ${invoice.reference} for ${formatMoney(
                invoice.totalCents,
              )}, due ${formatBusinessDate(invoice.dueDate)}.\n\n${
                BUSINESS.payment.accountName
              }\nBSB ${BUSINESS.payment.bsb}\nAccount ${BUSINESS.payment.accountNumber}\nReference ${invoice.reference}\n\nThanks,\n${BUSINESS.tradingName}`,
            )}`}
            className="rounded-lg border border-black/15 px-4 py-2 text-sm hover:border-leaf"
          >
            Open in email
          </a>
        )}
      </div>

      <div className="mt-4">
        <SendButton
          invoiceId={invoice.id}
          to={invoice.customerEmail}
          configured={emailConfigured}
        />
        {emailConfigured && (
          <p className="mt-2 text-xs text-bark/45">
            Sends from {BUSINESS.email} with the PDF attached, and marks the
            invoice as sent.
          </p>
        )}
      </div>

      <details className="mt-8">
        <summary className="cursor-pointer text-sm text-bark/45 hover:text-bark">
          Cancel this invoice
        </summary>
        <div className={`${card} mt-2 border-red-200`}>
          <p className="text-sm text-bark/70">
            Deletes {invoice.reference}. The visits it covers go back in the
            pool so they can be invoiced again.
          </p>
          <form action={deleteInvoice} className="mt-3">
            <input type="hidden" name="id" value={invoice.id} />
            <button
              type="submit"
              className="rounded-lg border border-red-600 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Delete {invoice.reference}
            </button>
          </form>
        </div>
      </details>
    </main>
  );
}
