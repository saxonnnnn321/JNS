import Link from 'next/link';
import { card, legend, FrequencyTag } from '@/components/ui';
import { formatMoney } from '@/lib/format';
import { formatBusinessDate } from '@/lib/dates';
import { dueDates, today, weeklyRecurringCents } from '@/lib/crm/schedule';
import { addDays } from '@/lib/dates';
import { customers, plansFor, propertiesFor } from '@/lib/crm/seed';

// These pages ask what day it is, so they must not be prerendered at build
// time — a statically generated run sheet would freeze on the build date and
// quietly show the wrong jobs forever.
export const dynamic = 'force-dynamic';


export default function CustomersPage() {
  const date = today();
  const horizon = addDays(date, 90);

  const rows = customers
    .map((customer) => {
      const plans = plansFor(customer.id);
      const next = plans
        .flatMap((plan) => dueDates(plan, date, horizon).slice(0, 1))
        .sort()[0];
      return {
        customer,
        plans,
        properties: propertiesFor(customer.id),
        next,
        perWeek: weeklyRecurringCents(plans),
      };
    })
    .sort((a, b) => b.perWeek - a.perWeek);

  const total = rows.reduce((t, r) => t + r.perWeek, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Customers</h1>
        <p className="text-sm text-bark/50">
          {customers.length} customers · {formatMoney(total)}/week recurring
        </p>
      </div>

      <div className="mt-5 space-y-2">
        {rows.map(({ customer, plans, properties, next, perWeek }) => (
          <Link
            key={customer.id}
            href={`/customers/${customer.id}`}
            className={`${card} block hover:border-leaf/40`}
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
            {customer.notes && (
              <p className="mt-1 text-xs text-bark/45">{customer.notes}</p>
            )}
          </Link>
        ))}
      </div>

      <p className={`${legend} mt-8`}>
        A real version would add: search, tags, lead status, and a &ldquo;lapsed&rdquo;
        filter for customers who have not been visited in a while.
      </p>
    </main>
  );
}
