import Link from 'next/link';
import { notFound } from 'next/navigation';
import { card, legend, FrequencyTag } from '@/components/ui';
import { formatMinutes, formatMoney } from '@/lib/format';
import { addDays, formatBusinessDate } from '@/lib/dates';
import { dueDates, estimateAccuracy, today, weeklyRecurringCents } from '@/lib/crm/schedule';
import {
  customerById,
  planById,
  plansFor,
  propertiesFor,
  propertyById,
  visitsFor,
} from '@/lib/crm/seed';

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = customerById(id);
  if (!customer) notFound();

  const date = today();
  const plans = plansFor(id);
  const properties = propertiesFor(id);
  const history = visitsFor(id);
  const accuracy = estimateAccuracy(history, (planId) => planById(planId)?.estimatedMinutes);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/customers" className="text-sm text-bark/50 hover:text-bark">
        ← Customers
      </Link>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">{customer.name}</h1>
        <span className="text-sm font-semibold text-leaf">
          {formatMoney(weeklyRecurringCents(plans))}/wk
        </span>
      </div>
      <p className="mt-1 text-sm text-bark/60">
        {[customer.phone, customer.email].filter(Boolean).join(' · ')} · Customer
        since {formatBusinessDate(customer.since)}
      </p>
      {customer.notes && (
        <p className={`${card} mt-3 text-sm`}>{customer.notes}</p>
      )}

      <section className="mt-6">
        <h2 className={legend}>Properties & standing work</h2>
        <div className="mt-2 space-y-3">
          {properties.map((property) => {
            const plan = plans.find((p) => p.propertyId === property.id);
            const upcoming = plan ? dueDates(plan, date, addDays(date, 84)).slice(0, 4) : [];
            return (
              <div key={property.id} className={card}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {property.addressLine}, {property.suburb} {property.postcode}
                  </span>
                  {plan && (
                    <span className="font-semibold text-leaf">
                      {formatMoney(plan.priceCents)}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-bark/50">
                  {property.lotId && `Lot ${property.lotId} · `}
                  {property.parcelAreaM2} m² block · {property.lawnAreaM2} m² lawn
                </p>
                {property.accessNotes && (
                  <p className="mt-1 text-xs text-amber-800">⚠ {property.accessNotes}</p>
                )}
                {plan ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-bark/60">
                    <FrequencyTag frequency={plan.frequency} />
                    <span>{formatMinutes(plan.estimatedMinutes)} a visit</span>
                    {plan.pausedUntil && (
                      <span className="text-amber-800">
                        Paused until {formatBusinessDate(plan.pausedUntil)}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-amber-800">No standing plan.</p>
                )}
                {upcoming.length > 0 && (
                  <p className="mt-2 text-xs text-bark/50">
                    Next: {upcoming.map((d) => formatBusinessDate(d)).join(' · ')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <h2 className={legend}>Visit history</h2>
        {accuracy && (
          <p className="mt-1 text-xs text-bark/50">
            {accuracy.visits} timed visits, running{' '}
            {accuracy.ratio >= 1
              ? `${Math.round((accuracy.ratio - 1) * 100)}% over`
              : `${Math.round((1 - accuracy.ratio) * 100)}% under`}{' '}
            estimate.
          </p>
        )}
        <div className={`${card} mt-2 overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className={legend}>
                <th className="pb-2 text-left font-semibold">Date</th>
                <th className="pb-2 text-left font-semibold">Property</th>
                <th className="pb-2 text-right font-semibold">Est.</th>
                <th className="pb-2 text-right font-semibold">Actual</th>
                <th className="pb-2 text-right font-semibold">Invoiced</th>
              </tr>
            </thead>
            <tbody>
              {history.map((visit) => {
                const plan = planById(visit.planId);
                const property = plan ? propertyById(plan.propertyId) : undefined;
                const over =
                  visit.actualMinutes && plan
                    ? visit.actualMinutes - plan.estimatedMinutes
                    : null;
                return (
                  <tr key={visit.id} className="border-t border-black/5">
                    <td className="py-1.5">{formatBusinessDate(visit.date)}</td>
                    <td className="py-1.5 text-bark/60">{property?.addressLine ?? '—'}</td>
                    <td className="py-1.5 text-right text-bark/50">
                      {plan ? formatMinutes(plan.estimatedMinutes) : '—'}
                    </td>
                    <td className="py-1.5 text-right">
                      {visit.status === 'skipped' ? (
                        <span className="text-amber-800">Skipped</span>
                      ) : visit.actualMinutes ? (
                        <>
                          {formatMinutes(visit.actualMinutes)}
                          {over !== null && over !== 0 && (
                            <span className={over > 0 ? 'text-amber-700' : 'text-leaf'}>
                              {' '}({over > 0 ? '+' : ''}{over})
                            </span>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-1.5 text-right text-bark/50">
                      {visit.invoiceId ? '✓' : visit.status === 'done' ? 'Not yet' : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {history.some((v) => v.notes) && (
          <ul className="mt-2 space-y-1 text-xs text-bark/50">
            {history
              .filter((v) => v.notes)
              .map((v) => (
                <li key={v.id}>
                  {formatBusinessDate(v.date)} — {v.notes}
                </li>
              ))}
          </ul>
        )}
      </section>
    </main>
  );
}
