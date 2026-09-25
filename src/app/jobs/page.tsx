import Link from 'next/link';
import { card, legend } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { formatBusinessDate } from '@/lib/dates';
import { loadRound } from '@/lib/crm/queries';
import {
  actualsFor,
  allJobs,
  asClaimLikes,
  claimsFor,
  valueOf,
} from '@/lib/invoicing/jobs';
import { jobLedger } from '@/lib/invoicing/claims';
import { advanceJob } from './actions';

export const dynamic = 'force-dynamic';

/**
 * The jobs board.
 *
 * Every figure here comes from `valueOf` and `jobLedger`, the same two
 * functions the customer's page and the invoice builder use. That matters:
 * these numbers used to be worked out as `price + materials` right here,
 * which read a cost-plus job as $0 and showed a part-billed job at its full
 * value. The same job then said different things on different screens.
 */

/** The order work actually moves through, and the press that moves it. */
const COLUMNS = [
  {
    status: 'quoted',
    label: 'Quoted',
    hint: 'Waiting on a yes',
    advance: { to: 'scheduled', label: 'They said yes' },
  },
  {
    status: 'scheduled',
    label: 'Booked in',
    hint: 'Agreed, not started',
    advance: { to: 'in_progress', label: 'Started it' },
  },
  {
    status: 'in_progress',
    label: 'Started',
    hint: 'On the tools',
    advance: { to: 'done', label: 'Finished' },
  },
  {
    status: 'done',
    label: 'Finished',
    hint: 'Ready to invoice',
    advance: null,
  },
] as const;

export default async function JobsPage() {
  const [round, jobs] = await Promise.all([loadRound(), allJobs()]);
  const jobIds = jobs.map((job) => job.id);
  const [actuals, claims] = await Promise.all([
    actualsFor(jobIds),
    claimsFor(jobIds),
  ]);
  const claimLikes = asClaimLikes(claims);

  const nameOf = (customerId: string) =>
    round.customerById(customerId)?.name ?? 'Unknown';
  const placeOf = (propertyId?: string) => {
    const property = propertyId ? round.propertyById(propertyId) : undefined;
    return property ? `${property.addressLine}, ${property.suburb}` : null;
  };

  // What each job is worth now, and how much of it is still to bill.
  const ledgerOf = (jobId: string, totalCents: number) =>
    jobLedger({ id: jobId, totalCents }, claimLikes);

  const worth = new Map(jobs.map((job) => [job.id, valueOf(job, actuals)]));
  const totalOf = (jobId: string) => worth.get(jobId)?.totalCents ?? 0;

  const pipeline = jobs
    .filter((job) => job.status !== 'done')
    .reduce((total, job) => total + totalOf(job.id), 0);
  // Finished and not yet invoiced, less any stage already billed.
  const readyToBill = jobs
    .filter((job) => job.status === 'done' && !job.invoiceId)
    .reduce(
      (total, job) => total + ledgerOf(job.id, totalOf(job.id)).remainingCents,
      0,
    );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Jobs</h1>
        <p className="text-sm text-bark/50">
          {formatMoney(pipeline)} in the pipeline
          {readyToBill > 0 && (
            <span className="text-leaf"> · {formatMoney(readyToBill)} to invoice</span>
          )}
        </p>
      </div>
      <p className="mt-1 text-sm text-bark/60">
        Construction and one-off work, quoted from the customer&rsquo;s page. The
        mowing round lives on the{' '}
        <Link href="/schedule" className="text-leaf hover:underline">
          schedule
        </Link>
        .
      </p>

      {jobs.length === 0 ? (
        <div className={`${card} mt-5`}>
          <p className="font-semibold">No jobs yet.</p>
          <p className="mt-1 text-sm text-bark/60">
            Open a customer and add one. A job is anything that happens once —
            a retaining wall, a turf job, a big cleanup — whether you quoted a
            price or you are charging cost plus. It does not need them to be on
            the mowing round.
          </p>
          <Link
            href="/customers"
            className="mt-3 inline-block rounded-lg bg-leaf px-5 py-2.5 text-sm font-medium text-white hover:bg-leaf/90"
          >
            Go to customers
          </Link>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          {COLUMNS.map((column) => {
            const inColumn = jobs.filter((job) => job.status === column.status);
            return (
              <section key={column.status}>
                <h2 className={legend}>
                  {column.label}{' '}
                  <span className="font-normal text-bark/35">
                    {inColumn.length}
                  </span>
                </h2>
                <p className="mt-0.5 text-xs text-bark/40">{column.hint}</p>

                <ul className="mt-2 space-y-2">
                  {inColumn.length === 0 && (
                    <li className={`${card} text-xs text-bark/35`}>Nothing here</li>
                  )}
                  {inColumn.map((job) => {
                    const value = worth.get(job.id);
                    const ledger = ledgerOf(job.id, value?.totalCents ?? 0);
                    return (
                      <li key={job.id} className={`${card} text-sm`}>
                        <Link
                          href={`/customers/${job.customerId}`}
                          className="font-medium hover:text-leaf"
                        >
                          {job.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-bark/60">
                          {nameOf(job.customerId)}
                        </p>
                        {placeOf(job.propertyId) && (
                          <p className="text-xs text-bark/45">
                            {placeOf(job.propertyId)}
                          </p>
                        )}

                        <p className="mt-1 font-semibold text-leaf">
                          {formatMoney(value?.totalCents ?? 0)}
                        </p>
                        {value?.isCostPlus && (
                          <p className="text-[11px] text-amber-800">
                            cost plus
                            {value.totalCents === 0 &&
                              ' · no hours or receipts yet'}
                          </p>
                        )}
                        {ledger.claimedCents > 0 && (
                          <p className="text-[11px] text-bark/50">
                            {formatMoney(ledger.claimedCents)} already claimed ·{' '}
                            {formatMoney(ledger.remainingCents)} to go
                          </p>
                        )}

                        {job.status === 'quoted' && (
                          <p className="mt-0.5 text-[11px] text-bark/45">
                            {job.quoteSentAt
                              ? `quote sent ${formatBusinessDate(job.quoteSentAt.slice(0, 10))}`
                              : 'quote not sent yet'}
                          </p>
                        )}
                        {job.scheduledFor && job.status !== 'done' && (
                          <p className="mt-0.5 text-xs text-bark/45">
                            booked {formatBusinessDate(job.scheduledFor)}
                          </p>
                        )}
                        {job.status === 'done' && (
                          <p className="mt-0.5 text-xs">
                            {job.invoiceId ? (
                              <span className="text-bark/40">invoiced</span>
                            ) : ledger.remainingCents === 0 &&
                              ledger.claimedCents > 0 ? (
                              <span className="text-bark/40">
                                billed in stages
                              </span>
                            ) : (
                              <span className="font-medium text-leaf">
                                ready to invoice
                              </span>
                            )}
                          </p>
                        )}

                        {/* One press, one step. The board used to send a
                            quoted job straight to finished, which skipped
                            the two statuses in between. */}
                        {column.advance && !job.invoiceId && (
                          <form action={advanceJob} className="mt-2">
                            <input type="hidden" name="id" value={job.id} />
                            <input
                              type="hidden"
                              name="customerId"
                              value={job.customerId}
                            />
                            <input
                              type="hidden"
                              name="to"
                              value={column.advance.to}
                            />
                            <button
                              type="submit"
                              className="rounded-lg border border-leaf px-3 py-1.5 text-xs font-medium text-leaf hover:bg-leaf-soft"
                            >
                              {column.advance.label}
                            </button>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
