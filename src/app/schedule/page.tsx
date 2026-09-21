import Link from 'next/link';
import { card, legend, FrequencyTag } from '@/components/ui';
import { formatMinutes, formatMoney } from '@/lib/format';
import { addDays, formatBusinessDate } from '@/lib/dates';
import { dayName, roundBetween, today, weekStart } from '@/lib/crm/schedule';
import { loadRound } from '@/lib/crm/queries';

// These pages ask what day it is, so they must not be prerendered at build
// time — a statically generated run sheet would freeze on the build date and
// quietly show the wrong jobs forever.
export const dynamic = 'force-dynamic';


const WEEKS = 3;

export default async function SchedulePage() {
  const date = today();
  const { lookup } = await loadRound();
  const start = weekStart(date);
  const stops = roundBetween(lookup, start, addDays(start, WEEKS * 7 - 1));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">The round</h1>
        <p className="text-sm text-bark/50">
          Next {WEEKS} weeks · {stops.length} visits ·{' '}
          {formatMoney(stops.reduce((t, s) => t + s.plan.priceCents, 0))}
        </p>
      </div>

      <div className="mt-5 space-y-6">
        {Array.from({ length: WEEKS }, (_, w) => addDays(start, w * 7)).map(
          (monday) => {
            const weekStops = stops.filter(
              (s) => s.date >= monday && s.date <= addDays(monday, 6),
            );
            const weekValue = weekStops.reduce((t, s) => t + s.plan.priceCents, 0);
            const weekMinutes = weekStops.reduce(
              (t, s) => t + s.plan.estimatedMinutes,
              0,
            );

            return (
              <section key={monday}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className={legend}>
                    Week of {formatBusinessDate(monday)}
                  </h2>
                  <p className="text-xs text-bark/50">
                    {formatMinutes(weekMinutes)} · {formatMoney(weekValue)}
                  </p>
                </div>

                <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {Array.from({ length: 5 }, (_, d) => addDays(monday, d)).map(
                    (day) => {
                      const dayStops = weekStops.filter((s) => s.date === day);
                      const isToday = day === date;
                      return (
                        <div
                          key={day}
                          className={`${card} ${isToday ? 'border-leaf ring-2 ring-leaf/20' : ''} ${
                            dayStops.length === 0 ? 'opacity-60' : ''
                          }`}
                        >
                          <p className="text-sm font-semibold">
                            {dayName(day).slice(0, 3)}{' '}
                            <span className="font-normal text-bark/40">
                              {day.slice(8)}/{day.slice(5, 7)}
                            </span>
                            {isToday && (
                              <span className="ml-1 text-[10px] font-bold uppercase text-leaf">
                                today
                              </span>
                            )}
                          </p>

                          {dayStops.length === 0 ? (
                            <p className="mt-2 text-xs text-bark/40">Free</p>
                          ) : (
                            <ul className="mt-2 space-y-2">
                              {dayStops.map((stop) => (
                                <li key={`${stop.plan.id}-${stop.date}`}>
                                  <Link
                                    href={`/customers/${stop.customer.id}`}
                                    className="block text-xs hover:text-leaf"
                                  >
                                    <span className="font-medium">
                                      {stop.property.suburb}
                                    </span>
                                    <br />
                                    <span className="text-bark/60">
                                      {stop.customer.name}
                                    </span>
                                    <br />
                                    <span className="text-bark/45">
                                      {formatMinutes(stop.plan.estimatedMinutes)} ·{' '}
                                      {formatMoney(stop.plan.priceCents)}
                                    </span>
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    },
                  )}
                </div>
              </section>
            );
          },
        )}
      </div>

      <div className={`${card} mt-8 text-sm`}>
        <p className={legend}>How this works</p>
        <p className="mt-2 text-bark/70">
          Nothing here is stored as individual bookings. Each customer has a
          standing plan — a start date and a cycle — and the visits are worked
          out from that on the fly. Change someone from fortnightly to weekly and
          every future date moves with it, with no re-entry.
        </p>
        <p className="mt-2 text-xs text-bark/50">
          Days are grouped by suburb, which is most of the benefit of route
          optimisation for a one-ute operation. Real optimisation, seasonal
          frequency changes (weekly in summer, monthly in winter) and rain-day
          bumping are the obvious next steps.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['weekly', 'fortnightly', 'monthly', 'onceOff'] as const).map((f) => (
            <FrequencyTag key={f} frequency={f} />
          ))}
        </div>
      </div>
    </main>
  );
}
