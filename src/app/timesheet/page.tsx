import Link from 'next/link';
import { card, legend } from '@/components/ui';
import { formatMinutes, formatMoney } from '@/lib/format';
import { addDays, formatBusinessDate } from '@/lib/dates';
import { today, weekStart } from '@/lib/crm/schedule';
import { loadPeriodBooks } from '@/lib/partners/queries';
import { currentStaff } from '@/lib/supabase/server';
import { DrawingForm, HoursForm, IncomeForm } from './forms';
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

  const [books, staff] = await Promise.all([
    loadPeriodBooks(from, to),
    currentStaff(),
  ]);

  const people = books.split.partners.map((p) => ({ id: p.id, name: p.name }));
  const isOwner = staff?.role === 'owner';
  const self = staff?.id ?? '';

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

      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
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
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
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

          <section className={`${card} mt-6`}>
            <p className={legend}>Log hours</p>
            <div className="mt-3">
              <HoursForm
                people={people}
                canChoose={isOwner}
                self={self}
                today={date}
                defaultHours={params.hours}
                defaultWhat={params.what}
              />
            </div>
          </section>

          <Rows
            title="Hours this period"
            empty="No hours logged yet."
            rows={books.entries.map((entry) => ({
              id: entry.id,
              table: 'timesheet_entries',
              date: entry.workDate,
              left: entry.staffName,
              middle: entry.description ?? '—',
              right: formatMinutes(entry.minutes),
            }))}
          />

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
              Visits marked done are counted automatically. This is for cash
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
