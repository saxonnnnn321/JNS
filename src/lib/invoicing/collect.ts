import type { Round } from '../crm/queries';
import type { InvoiceableVisit } from './build';

/**
 * Which of a customer's finished visits have not been billed yet.
 *
 * A visit counts as billable when it has been ticked off AND carries no
 * invoice id. Stamping the invoice id onto the visit at the moment the
 * invoice is created is what stops the same mow being charged twice — the
 * database, not a date range, is the memory.
 *
 * Pure, over an already-loaded round.
 */
export function invoiceableVisitsFor(
  round: Round,
  customerId: string,
): InvoiceableVisit[] {
  const planIds = new Set(round.plansFor(customerId).map((plan) => plan.id));

  return round.visits
    .filter(
      (visit) =>
        visit.status === 'done' && !visit.invoiceId && planIds.has(visit.planId),
    )
    .map((visit) => {
      const plan = round.planById(visit.planId);
      const property = plan ? round.propertyById(plan.propertyId) : undefined;
      if (!plan) return null;
      return {
        visitId: visit.id,
        date: visit.date,
        planId: plan.id,
        priceCents: plan.priceCents,
        packageKey: plan.packageKey,
        propertyLabel: property
          ? `${property.addressLine}, ${property.suburb}`
          : 'Property',
      } satisfies InvoiceableVisit;
    })
    .filter((visit): visit is InvoiceableVisit => visit !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}
