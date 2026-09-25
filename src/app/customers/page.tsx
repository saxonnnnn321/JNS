import Link from 'next/link';
import { card, FrequencyTag } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { formatBusinessDate } from '@/lib/dates';
import { dueDates, today, weeklyRecurringCents } from '@/lib/crm/schedule';
import { addDays } from '@/lib/dates';
import { loadRound } from '@/lib/crm/queries';
import { lapse, matchesSearch, tightestCycle } from '@/lib/crm/directory';

// These pages ask what day it is, so they must not be prerendered at build
// time — a statically generated run sheet would freeze on the build date and
// quietly show the wrong jobs forever.
export const dynamic = 'force-dynamic';

const searchInput =
  'w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20';

/**
 * The customer list.
 *
 * Searching is a plain GET form rather than a typeahead, on purpose: it works
 * with the keyboard shut, it survives a back press, and the result is a URL you
 * can keep. `?quiet=1` narrows it to the people who have gone quiet.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; quiet?: string }>;
}) {
  const { q = '', quiet } = await searchParams;
  const query = q.trim();
  const quietOnly = quiet === '1';

  const date = today();
  const { customers, plansFor, propertiesFor, visitsFor } = await loadRound();
  const horizon = addDays(date, 90);

  const all = customers.map((customer) => {
    const plans = plansFor(customer.id);
    const properties = propertiesFor(customer.id);
    const next = plans
      .flatMap((plan) => dueDates(plan, date, horizon).slice(0, 1))
      .sort()[0];

    // The most recent visit actually done, which is what "gone quiet" means.
    const lastVisit = visitsFor(customer.id)
      .filter((visit) => visit.status === 'done')
      .map((visit) => visit.date)
      .sort()
      .at(-1);

    return {
      customer,
      plans,
      properties,
      next,
      perWeek: weeklyRecurringCents(plans),
      gone: lapse({
        today: date,
        lastVisit,
        frequency: tightestCycle(plans),
        onTheRound: plans.some((plan) => plan.active),
      }),
      // Everything worth typing into the box to find them.
      searchable: [
        customer.name,
        customer.phone,
        customer.email,
        ...properties.flatMap((property) => [
          property.addressLine,
          property.suburb,
          property.postcode,
        ]),
      ],
    };
  });

  const quietCount = all.filter((row) => row.gone.lapsed).length;

  const rows = all
    .filter((row) => matchesSearch(query, row.searchable))
    .filter((row) => !quietOnly || row.gone.lapsed)
    .sort((a, b) => b.perWeek - a.perWeek);

  const total = rows.reduce((t, r) => t + r.perWeek, 0);
  const filtered = query !== '' || quietOnly;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Customers</h1>
        <div className="flex items-baseline gap-4">
          <p className="text-sm text-bark/50">
            {rows.length}
            {filtered ? ` of ${customers.length}` : ''} customer
            {customers.length === 1 ? '' : 's'} · {formatMoney(total)}/week
            recurring
          </p>
          <Link
            href="/customers/new"
            className="rounded-lg bg-leaf px-4 py-2 text-sm font-medium text-white hover:bg-leaf/90"
          >
            + Add
          </Link>
        </div>
      </div>

      {customers.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form method="get" className="flex min-w-0 flex-1 gap-2">
            {quietOnly && <input type="hidden" name="quiet" value="1" />}
            <input
              name="q"
              defaultValue={query}
              className={searchInput}
              placeholder="Name, street, suburb or phone"
              aria-label="Search customers"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg border border-leaf px-4 text-sm font-medium text-leaf hover:bg-leaf-soft"
            >
              Search
            </button>
          </form>

          {quietCount > 0 && (
            <Link
              href={quietOnly ? '/customers' : '/customers?quiet=1'}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                quietOnly
                  ? 'bg-amber-800 text-white'
                  : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
              }`}
            >
              {quietOnly ? '← Everyone' : `${quietCount} gone quiet`}
            </Link>
          )}
        </div>
      )}

      {customers.length === 0 && (
        <div className={`${card} mt-5`}>
          <p className="font-semibold">No customers yet.</p>
          <p className="mt-1 text-sm text-bark/60">
            Add one and it shows up here, on the round, and on today&rsquo;s run
            sheet. You can measure the block while you are at it.
          </p>
          <Link
            href="/customers/new"
            className="mt-3 inline-block rounded-lg bg-leaf px-5 py-2.5 text-sm font-medium text-white hover:bg-leaf/90"
          >
            Add your first customer
          </Link>
        </div>
      )}

      {customers.length > 0 && rows.length === 0 && (
        <div className={`${card} mt-5`}>
          <p className="text-sm font-semibold">Nobody matches that.</p>
          <Link href="/customers" className="mt-2 inline-block text-sm text-leaf hover:underline">
            Clear the search
          </Link>
        </div>
      )}

      <div className="mt-5 space-y-2">
        {rows.map(({ customer, plans, properties, next, perWeek, gone }) => (
          <Link
            key={customer.id}
            href={`/customers/${customer.id}`}
            className={`${card} block hover:border-leaf/40 ${
              gone.lapsed ? 'border-amber-300' : ''
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">{customer.name}</span>
              <span className="text-sm font-semibold text-leaf">
                {perWeek > 0 ? `${formatMoney(perWeek)}/wk` : '—'}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-bark/60">
              {properties.map((p) => `${p.addressLine}, ${p.suburb}`).join(' · ')}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-bark/50">
              {plans.map((plan) => (
                <FrequencyTag key={plan.id} frequency={plan.frequency} />
              ))}
              {next ? (
                <span>Next {formatBusinessDate(next)}</span>
              ) : (
                <span className="text-amber-800">Nothing scheduled</span>
              )}
              <span>· Since {formatBusinessDate(customer.since)}</span>
            </div>
            {gone.label && (
              <p className="mt-1 text-xs font-medium text-amber-800">
                ⚠ {gone.label}
              </p>
            )}
            {customer.notes && (
              <p className="mt-1 text-xs text-bark/45">{customer.notes}</p>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}
