import Link from 'next/link';
import { card, legend } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { addDays, formatBusinessDate } from '@/lib/dates';
import { today } from '@/lib/crm/schedule';
import { loadRound } from '@/lib/crm/queries';
import { loadReceipts, spendBetween } from '@/lib/receipts/queries';
import { allJobs } from '@/lib/invoicing/jobs';
import { ReceiptCapture } from './capture';
import { deleteReceipt } from './actions';

export const dynamic = 'force-dynamic';

export default async function ReceiptsPage() {
  const date = today();
  const [round, { receipts, unavailable }, jobs] = await Promise.all([
    loadRound(),
    loadReceipts(),
    allJobs(),
  ]);

  const customers = round.customers.map((customer) => ({
    id: customer.id,
    label: customer.name,
  }));
  const nameOf = (customerId?: string) =>
    customerId ? round.customerById(customerId)?.name : undefined;

  const month = spendBetween(receipts, addDays(date, -30), date);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Receipts</h1>
      <p className="mt-1 text-sm text-bark/60">
        Photograph it once, on the spot. Anything bought for a customer goes
        on their next invoice by itself.
      </p>

      {unavailable ? (
        <div className={`${card} mt-5`}>
          <p className="font-semibold">Receipts are not set up yet.</p>
          <p className="mt-1 text-sm text-bark/60">
            Run migration 0007 in the Supabase SQL editor — it makes the table
            and the private bucket the photos live in.
          </p>
        </div>
      ) : (
        <>
          <section className={`${card} mt-5`}>
            <p className={legend}>New receipt</p>
            <div className="mt-3">
              <ReceiptCapture
                customers={customers}
                jobs={jobs
                  .filter((job) => job.status !== 'cancelled')
                  .map((job) => ({
                    id: job.id,
                    label: job.title,
                    customerId: job.customerId,
                  }))}
                today={date}
              />
            </div>
          </section>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className={card}>
              <p className={legend}>Last 30 days</p>
              <p className="mt-1 text-2xl font-bold text-leaf">
                {formatMoney(month.totalCents)}
              </p>
              <p className="text-xs text-bark/50">spent</p>
            </div>
            <div className={card}>
              <p className={legend}>Charging back</p>
              <p className="mt-1 text-2xl font-bold text-leaf">
                {formatMoney(month.rechargeableCents)}
              </p>
              <p className="text-xs text-bark/50">on customer invoices</p>
            </div>
            <div className={card}>
              <p className={legend}>Your own cost</p>
              <p className="mt-1 text-2xl font-bold">
                {formatMoney(month.overheadCents)}
              </p>
              <p className="text-xs text-bark/50">fuel, gear, the ute</p>
            </div>
          </div>

          <section className="mt-6">
            <h2 className={legend}>Everything filed</h2>
            {receipts.length === 0 ? (
              <p className={`${card} mt-2 text-sm text-bark/50`}>
                Nothing yet. Photograph the next one at the counter — it takes
                about ten seconds and it is the bit everyone forgets.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {receipts.map((receipt) => (
                  <li key={receipt.id} className={`${card} flex gap-3 text-sm`}>
                    {receipt.photoUrl ? (
                      <a
                        href={receipt.photoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={receipt.photoUrl}
                          alt={`Receipt from ${receipt.supplier ?? 'a supplier'}`}
                          className="h-20 w-16 rounded-lg border border-black/10 object-cover"
                        />
                      </a>
                    ) : (
                      <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-lg bg-bark/5 px-1 text-center text-[10px] text-bark/40">
                        {receipt.storagePath ? 'photo unavailable' : 'no receipt'}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-semibold">
                          {receipt.supplier ?? 'Receipt'}
                        </span>
                        <span className="font-semibold text-leaf">
                          {formatMoney(receipt.amountCents)}
                        </span>
                      </div>
                      <p className="text-xs text-bark/50">
                        {formatBusinessDate(receipt.purchasedOn)}
                      </p>
                      {receipt.notes && (
                        <p className="mt-0.5 text-xs text-bark/70">{receipt.notes}</p>
                      )}
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        {receipt.customerId ? (
                          <Link
                            href={`/customers/${receipt.customerId}`}
                            className="text-leaf hover:underline"
                          >
                            {nameOf(receipt.customerId) ?? 'Customer'}
                          </Link>
                        ) : (
                          <span className="text-bark/45">Business cost</span>
                        )}
                        {receipt.rechargeable && (
                          <span className="rounded-full bg-leaf-soft px-2 py-0.5 text-[11px] text-leaf">
                            {receipt.billed ? 'invoiced' : 'on their next invoice'}
                          </span>
                        )}
                      </p>
                    </div>

                    <form action={deleteReceipt}>
                      <input type="hidden" name="id" value={receipt.id} />
                      <button
                        type="submit"
                        aria-label="Delete receipt"
                        className="px-1 text-bark/30 hover:text-red-600"
                      >
                        ×
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className={`${card} mt-8 text-xs text-bark/60`}>
            Photos are kept in a private bucket. The links on this page are
            signed and expire after ten minutes, because a receipt shows a
            supplier, a date, an amount and sometimes part of a card number.
          </p>
        </>
      )}
    </main>
  );
}
