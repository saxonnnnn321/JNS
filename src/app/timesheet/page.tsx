import Link from 'next/link';
import { card, legend } from '@/components/ui';
import { formatMinutes, formatMoney } from '@/lib/format';
import { addDays, formatBusinessDate } from '@/lib/dates';
import { dayName, today, weekStart } from '@/lib/crm/schedule';
import { loadPeriodBooks, type TimesheetEntry } from '@/lib/partners/queries';
import { allJobs } from '@/lib/invoicing/jobs';
import { loadRound } from '@/lib/crm/queries';
import type { WorkOption } from './forms';
import { currentStaff } from '@/lib/supabase/server';
import { DrawingForm, EditEntry, HoursForm, IncomeForm } from './forms';
import { Timer } from './timer';
import { removeRow } from './actions';

// Asks what week it is, so it must never be prerendered at build time.
export const dynamic = 'force-dynamic';

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    hours?: string;
    what?: string;
  }>;
}) {
  const params = await searchParams;
  const date = today();
  const from = params.from ?? weekStart(date);
  const to = params.to ?? addDays(from, 6);

  const [books, staff, jobs, round] = await Promise.all([
    loadPeriodBooks(from, to),
    currentStaff(),
    allJobs(),
    loadRound(),
  ]);

  // Jobs first — hours on a cost-plus job are what it gets billed for.
  //
  // A finished job stays in the list until it is invoiced. Dropping it the
  // moment it was marked done meant the last day's hours had nowhere to go,
  // and on a cost-plus job those hours ARE the bill.
  const work: WorkOption[] = [
    ...jobs
      .filter((job) => job.status !== 'cancelled' && !job.invoiceId)
      .map((job) => ({
        id: job.id,
        kind: 'job' as const,
        label: `${round.customerById(job.customerId)?.name ?? 'Unknown'} — ${job.title}${
          job.pricing === 'costPlus' ? ' (cost plus)' : ''
        }${job.status === 'done' ? ' · finished' : ''}`,
      })),
    ...books.customers.map((customer) => ({
      id: customer.id,
      kind: 'customer' as const,
      label: customer.name,
    })),
  ];

  const people = books.split.partners.map((p) => ({ id: p.id, name: p.name }));
  const isOwner = staff?.role === 'owner';
  const self = staff?.id ?? '';
  const myTimer = books.runningTimers.find((t) => t.staffId === self) ?? null;
  const othersRunning = books.runningTimers.filter((t) => t.staffId !== self);

  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Timesheet</h1>
        <Link
          href={`/timesheet/split?from=${from}&to=${to}`}
          className="text-sm font-medium text-leaf hover:underline"
        >
          Work out the split →
        </Link>
      </div>

      {books.notConfigured ? (
        <div className={`${card} mt-5`}>
          <p className="font-semibold">The timesheet is not set up yet.</p>
          <p className="mt-1 text-sm text-bark/60">
            The tables it needs are not in the database. Run migration 0004 in
            the Supabase SQL editor, then come back.
          </p>
        </div>
      ) : (
        <>
          {/* ---------- the clock ---------- */}
          <section className={`${card} mt-5`}>
            <p className={legend}>The clock</p>
            {books.timerUnavailable ? (
              <p className="mt-2 text-sm text-bark/60">
                Run migration 0005 in Supabase and the start/stop clock appears
                here. Until then, log hours by hand below.
              </p>
            ) : (
              <div className="mt-3">
                <Timer running={myTimer} work={work} />
              </div>
            )}
            {othersRunning.map((timer) => (
              <p key={timer.staffId} className="mt-3 text-xs text-bark/50">
                {timer.staffName} has a clock running
                {timer.description ? ` — ${timer.description}` : ''}.
              </p>
            ))}
          </section>

          {/* ---------- period ---------- */}
          <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
            <Link
              href={`/timesheet?from=${addDays(from, -7)}&to=${addDays(to, -7)}`}
              className="text-bark/50 hover:text-bark"
            >
              ← Previous
            </Link>
            <span className="text-bark/70">
              {formatBusinessDate(from)} – {formatBusinessDate(to)}
            </span>
            <Link
              href={`/timesheet?from=${addDays(from, 7)}&to=${addDays(to, 7)}`}
              className="text-bark/50 hover:text-bark"
            >
              Next →
            </Link>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {books.split.partners.map((partner) => (
              <div key={partner.id} className={card}>
                <p className={legend}>{partner.name}</p>
                <p className="mt-1 text-2xl font-bold text-leaf">
                  {formatMinutes(partner.minutesWorked)}
                </p>
                <p className="text-xs text-bark/50">
                  drawn {formatMoney(partner.drawnCents)}
                </p>
              </div>
            ))}
            <div className={card}>
              <p className={legend}>Income this period</p>
              <p className="mt-1 text-2xl font-bold text-leaf">
                {formatMoney(books.roundIncomeCents + books.manualIncomeCents)}
              </p>
              <p className="text-xs text-bark/50">
                {formatMoney(books.roundIncomeCents)} round ·{' '}
                {formatMoney(books.manualIncomeCents)} other
              </p>
            </div>
          </div>

          {/* ---------- the week at a glance ---------- */}
          <section className="mt-6">
            <h2 className={legend}>The week</h2>
            <div className={`${card} mt-2 overflow-x-auto`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={legend}>
                    <th className="pb-2 text-left font-semibold">Who</th>
                    {days.map((day) => (
                      <th
                        key={day}
                        className={`pb-2 text-right font-semibold ${day === date ? 'text-leaf' : ''}`}
                      >
                        {dayName(day).slice(0, 3)}
                      </th>
                    ))}
                    <th className="pb-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {books.split.partners.map((partner) => (
                    <tr key={partner.id} className="border-t border-black/5">
                      <td className="py-2 font-medium">{partner.name}</td>
                      {days.map((day) => {
                        const minutes = books.entries
                          .filter(
                            (e) => e.staffId === partner.id && e.workDate === day,
                          )
                          .reduce((t, e) => t + e.minutes, 0);
                        return (
                          <td
                            key={day}
                            className={`py-2 text-right tabular-nums ${
                              minutes === 0 ? 'text-bark/25' : ''
                            } ${day === date ? 'font-semibold text-leaf' : ''}`}
                          >
                            {minutes === 0 ? '·' : (minutes / 60).toFixed(1)}
                          </td>
                        );
                      })}
                      <td className="py-2 text-right font-semibold">
                        {formatMinutes(partner.minutesWorked)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ---------- log by hand ---------- */}
          <section className={`${card} mt-6`}>
            <p className={legend}>Log hours by hand</p>
            <div className="mt-3">
              <HoursForm
                people={people}
                canChoose={isOwner}
                self={self}
                today={date}
                defaultHours={params.hours}
                defaultWhat={params.what}
                work={work}
              />
            </div>
          </section>

          <HourRows entries={books.entries} work={work} />

          <section className={`${card} mt-6`}>
            <p className={legend}>Money taken out</p>
            <p className="mt-1 text-xs text-bark/50">
              Whatever either of you actually took — wages, cash, a transfer.
              This is what the split measures against.
            </p>
            <div className="mt-3">
              <DrawingForm
                people={people}
                canChoose={isOwner}
                self={self}
                today={date}
              />
            </div>
          </section>

          <Rows
            title="Drawings this period"
            empty="Nothing drawn yet."
            rows={books.drawings.map((row) => ({
              id: row.id,
              table: 'partner_drawings',
              date: row.date,
              left: row.staffName ?? '—',
              middle: row.note ?? '—',
              right: formatMoney(row.amountCents),
            }))}
          />

          <section className={`${card} mt-6`}>
            <p className={legend}>Income not on the round</p>
            <p className="mt-1 text-xs text-bark/50">
              Visits ticked off are counted automatically. This is for cash
              jobs and one-offs that never made it onto a plan.
            </p>
            <div className="mt-3">
              <IncomeForm today={date} />
            </div>
          </section>

          <Rows
            title="Other income this period"
            empty="None recorded."
            rows={books.income.map((row) => ({
              id: row.id,
              table: 'income_entries',
              date: row.date,
              left: '—',
              middle: row.note ?? '—',
              right: formatMoney(row.amountCents),
            }))}
          />
        </>
      )}
    </main>
  );
}

/** Hours get their own list, because these are the rows you edit. */
function HourRows({
  entries,
  work,
}: {
  entries: TimesheetEntry[];
  work: WorkOption[];
}) {
  const nameOf = (entry: TimesheetEntry) => {
    const match = entry.jobId
      ? work.find((o) => o.kind === 'job' && o.id === entry.jobId)
      : entry.customerId
        ? work.find((o) => o.kind === 'customer' && o.id === entry.customerId)
        : undefined;
    return match?.label;
  };

  return (
    <section className="mt-6">
      <h2 className={legend}>Hours this period</h2>
      {entries.length === 0 ? (
        <p className={`${card} mt-2 text-sm text-bark/50`}>No hours logged yet.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {entries.map((entry) => (
            <li key={entry.id} className={`${card} py-2 text-sm`}>
              <details>
                <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="w-28 shrink-0 text-bark/50">
                    {formatBusinessDate(entry.workDate)}
                  </span>
                  <span className="font-medium">{entry.staffName}</span>
                  <span className="min-w-0 flex-1 truncate text-bark/60">
                    {entry.description ?? '—'}
                    {nameOf(entry) && (
                      <span className="ml-2 rounded-full bg-leaf-soft px-2 py-0.5 text-[11px] text-leaf">
                        {nameOf(entry)}
                      </span>
                    )}
                  </span>
                  <span className="font-semibold text-leaf">
                    {formatMinutes(entry.minutes)}
                  </span>
                </summary>
                <EditEntry
                  id={entry.id}
                  workDate={entry.workDate}
                  hours={(entry.minutes / 60).toFixed(2)}
                  description={entry.description ?? ''}
                  customerId={entry.customerId}
                  jobId={entry.jobId}
                  work={work}
                />
                <form action={removeRow} className="mt-2">
                  <input type="hidden" name="table" value="timesheet_entries" />
                  <input type="hidden" name="id" value={entry.id} />
                  <button
                    type="submit"
                    className="text-xs text-bark/40 hover:text-red-600"
                  >
                    Delete this entry
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Rows({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: {
    id: string;
    table: string;
    date: string;
    left: string;
    middle: string;
    right: string;
  }[];
}) {
  return (
    <section className="mt-6">
      <h2 className={legend}>{title}</h2>
      {rows.length === 0 ? (
        <p className={`${card} mt-2 text-sm text-bark/50`}>{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {rows.map((row) => (
            <li
              key={row.id}
              className={`${card} flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm`}
            >
              <span className="w-28 shrink-0 text-bark/50">
                {formatBusinessDate(row.date)}
              </span>
              <span className="font-medium">{row.left}</span>
              <span className="min-w-0 flex-1 truncate text-bark/60">
                {row.middle}
              </span>
              <span className="font-semibold text-leaf">{row.right}</span>
              <form action={removeRow}>
                <input type="hidden" name="table" value={row.table} />
                <input type="hidden" name="id" value={row.id} />
                <button
                  type="submit"
                  aria-label="Remove"
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
  );
}
