import Link from 'next/link';
import { card, legend, FrequencyTag, Stat } from '@/components/ui';
import { formatMinutes, formatMoney } from '@/lib/format';
import { formatBusinessDate } from '@/lib/dates';
import {
  dayName,
  estimateAccuracy,
  roundBetween,
  roundForDay,
  today,
  unbilledVisits,
  weeklyRecurringCents,
  weekStart,
} from '@/lib/crm/schedule';
import { addDays } from '@/lib/dates';
import { loadRound } from '@/lib/crm/queries';

// These pages ask what day it is, so they must not be prerendered at build
// time — a statically generated run sheet would freeze on the build date and
// quietly show the wrong jobs forever.
export const dynamic = 'force-dynamic';


export default async function TodayPage() {
  const date = today();
  const { lookup, planById, plans, visits, isEmpty } = await loadRound();
  const stops = roundForDay(lookup, date);
  const week = roundBetween(lookup, weekStart(date), addDays(weekStart(date), 6));

  const dayMinutes = stops.reduce((t, s) => t + s.plan.estimatedMinutes, 0);
  const dayValue = stops.reduce((t, s) => t + s.plan.priceCents, 0);
  const weekValue = week.reduce((t, s) => t + s.plan.priceCents, 0);

  const accuracy = estimateAccuracy(
    visits,
    (planId) => planById(planId)?.estimatedMinutes,
  );
  const unbilled = unbilledVisits(visits);
  const unbilledCents = unbilled.reduce(
    (t, v) => t + (planById(v.planId)?.priceCents ?? 0),
    0,
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">
          {dayName(date)}{' '}
          <span className="text-bark/40">{formatBusinessDate(date)}</span>
        </h1>
        <Link href="/quotes/new" className="text-sm font-medium text-leaf hover:underline">
          + New quote
        </Link>
      </div>

      {isEmpty && (
        <div className={`${card} mt-5`}>
          <p className="font-semibold">Nothing here yet.</p>
          <p className="mt-1 text-sm text-bark/60">
            Add your customers and the round builds itself — today&rsquo;s jobs,
            the week ahead and what you are owed all come from their standing
            plans.
          </p>
          <Link
            href="/customers/new"
            className="mt-3 inline-block rounded-lg bg-leaf px-5 py-2.5 text-sm font-medium text-white hover:bg-leaf/90"
          >
            Add your first customer
          </Link>
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="On today"
          value={`${stops.length} job${stops.length === 1 ? '' : 's'}`}
          hint={stops.length ? `${formatMinutes(dayMinutes)} · ${formatMoney(dayValue)}` : 'Nothing booked'}
        />
        <Stat label="This week" value={formatMoney(weekValue)} hint={`${week.length} visits`} />
        <Stat
          label="Round value"
          value={`${formatMoney(weeklyRecurringCents(plans))}/wk`}
          hint={`${plans.filter((p) => p.active).length} active plans`}
        />
        <Stat
          label="Unbilled"
          value={formatMoney(unbilledCents)}
          hint={`${unbilled.length} finished, not invoiced`}
        />
      </div>

      <section className="mt-6">
        <h2 className={legend}>Run sheet</h2>
        {stops.length === 0 ? (
          <p className={`${card} mt-2 text-sm text-bark/60`}>
            Nothing on today. The rest of the week is below.
          </p>
        ) : (
          <ol className="mt-2 space-y-2">
            {stops.map((stop, index) => (
              <li key={`${stop.plan.id}-${stop.date}`} className={`${card} flex gap-4`}>
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-sm font-semibold text-leaf">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link
                      href={`/customers/${stop.customer.id}`}
                      className="font-semibold hover:text-leaf"
                    >
                      {stop.customer.name}
                    </Link>
                    <span className="font-semibold text-leaf">
                      {formatMoney(stop.plan.priceCents)}
                    </span>
                  </div>
                  <p className="text-sm text-bark/70">
                    {stop.property.addressLine}, {stop.property.suburb}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-bark/50">
                    <FrequencyTag frequency={stop.plan.frequency} />
                    <span>{formatMinutes(stop.plan.estimatedMinutes)}</span>
                    {stop.customer.phone && <span>· {stop.customer.phone}</span>}
                  </p>
                  {stop.property.accessNotes && (
                    <p className="mt-1 text-xs text-amber-800">
                      ⚠ {stop.property.accessNotes}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-8">
        <h2 className={legend}>Rest of the week</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i))
            .filter((d) => d > date)
            .map((d) => {
              const dayStops = week.filter((s) => s.date === d);
              if (dayStops.length === 0) return null;
              return (
                <div key={d} className={card}>
                  <p className="text-sm font-semibold">
                    {dayName(d)}{' '}
                    <span className="font-normal text-bark/40">
                      {dayStops.length} job{dayStops.length === 1 ? '' : 's'}
                    </span>
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-bark/70">
                    {dayStops.map((s) => (
                      <li key={s.plan.id}>
                        {s.property.suburb} — {s.customer.name}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
        </div>
      </section>

      {accuracy && (
        <section className={`${card} mt-8`}>
          <h2 className={legend}>Is the rate card right?</h2>
          <p className="mt-2 text-sm">
            Across <b>{accuracy.visits}</b> completed visits, jobs are running{' '}
            <b className={accuracy.ratio > 1.05 ? 'text-amber-700' : 'text-leaf'}>
              {accuracy.ratio >= 1
                ? `${Math.round((accuracy.ratio - 1) * 100)}% over`
                : `${Math.round((1 - accuracy.ratio) * 100)}% under`}
            </b>{' '}
            the estimate — a median of{' '}
            {accuracy.medianOverrunMinutes >= 0 ? '+' : ''}
            {Math.round(accuracy.medianOverrunMinutes)} minutes a job.
          </p>
          <p className="mt-1 text-xs text-bark/50">
            This is the number that eventually replaces the guesses in the rate
            card with measured figures. Not enough visits yet to act on.
          </p>
        </section>
      )}
    </main>
  );
}
