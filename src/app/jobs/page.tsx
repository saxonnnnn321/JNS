import Link from 'next/link';
import { card, legend } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { formatBusinessDate } from '@/lib/dates';
import { loadRound } from '@/lib/crm/queries';
import { allJobs } from '@/lib/invoicing/jobs';
import { finishJob } from './actions';

export const dynamic = 'force-dynamic';

/** The order work actually moves through, which is how the board reads. */
const COLUMNS = [
  { status: 'quoted', label: 'Quoted', hint: 'Waiting on a yes' },
  { status: 'scheduled', label: 'Booked in', hint: 'Agreed, not started' },
  { status: 'in_progress', label: 'Started', hint: 'On the tools' },
  { status: 'done', label: 'Finished', hint: 'Ready to invoice' },
] as const;

export default async function JobsPage() {
  const [round, jobs] = await Promise.all([loadRound(), allJobs()]);

  const nameOf = (customerId: string) =>
    round.customerById(customerId)?.name ?? 'Unknown';
  const placeOf = (propertyId?: string) => {
    const property = propertyId ? round.propertyById(propertyId) : undefined;
    return property ? `${property.addressLine}, ${property.suburb}` : null;
  };

  const pipeline = jobs
    .filter((job) => job.status !== 'done')
    .reduce((total, job) => total + job.priceCents + job.materialsCents, 0);
  const readyToBill = jobs
    .filter((job) => job.status === 'done' && !job.invoiceId)
    .reduce((total, job) => total + job.priceCents + job.materialsCents, 0);

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
        Construction and one-off work. The mowing round lives on the{' '}
        <Link href="/schedule" className="text-leaf hover:underline">
          schedule
        </Link>
        .
      </p>

      {jobs.length === 0 ? (
        <div className={`${card} mt-5`}>
          <p className="font-semibold">No jobs yet.</p>
          <p className="mt-1 text-sm text-bark/60">
            Open a customer and add one. A job is anything that happens once
            for an agreed price — a retaining wall, a turf job, a big cleanup.
            It does not need them to be on the mowing round.
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
                  {inColumn.map((job) => (
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
                        {formatMoney(job.priceCents + job.materialsCents)}
                      </p>
                      {job.scheduledFor && job.status !== 'done' && (
                        <p className="mt-0.5 text-xs text-bark/45">
                          booked {formatBusinessDate(job.scheduledFor)}
                        </p>
                      )}
                      {job.status === 'done' && (
                        <p className="mt-0.5 text-xs">
                          {job.invoiceId ? (
                            <span className="text-bark/40">invoiced</span>
                          ) : (
                            <span className="font-medium text-leaf">
                              ready to invoice
                            </span>
                          )}
                        </p>
                      )}
                      {job.status !== 'done' && (
                        <form action={finishJob} className="mt-2">
                          <input type="hidden" name="id" value={job.id} />
                          <button
                            type="submit"
                            className="rounded-lg border border-leaf px-3 py-1.5 text-xs font-medium text-leaf hover:bg-leaf-soft"
                          >
                            Finished
                          </button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
