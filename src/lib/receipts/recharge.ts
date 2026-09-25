/**
 * Does filing this receipt also need an invoice line of its own?
 *
 * A receipt can reach a customer's bill by two completely different roads:
 *
 *   1. As an extra charge — an `invoice_extras` row created the moment you
 *      tick "charge it back". This is the only road for a fixed-price job or
 *      for a purchase that belongs to nobody's job in particular.
 *
 *   2. Through a cost-plus job — `jobValue()` adds up the receipts filed
 *      against the job and bills them, with the materials margin on top.
 *
 * It must never travel both, and until this existed it could: picking a
 * cost-plus job and ticking "charge it back" put the same bag of cement on
 * the invoice twice, once at cost and once with the margin. Nothing on screen
 * hinted at it and the totals looked plausible, which is the worst kind of
 * money bug.
 *
 * Pure, so the rule is testable without a database and the form and the
 * server action can both ask the same question.
 */

export type ReceiptDestination = {
  /** There is someone to charge. Without one, nothing can be charged back. */
  hasCustomer: boolean;
  /** Did you ask for it to go on their bill? */
  rechargeable: boolean;
  /** How the job it was filed against is priced, if it was filed against one. */
  jobPricing?: 'fixed' | 'costPlus';
};

export type RechargePlan = {
  /** Create an `invoice_extras` row. */
  extraLine: boolean;
  /** Why not, when not — the wording the screen shows. */
  because?: string;
};

export function rechargePlan(to: ReceiptDestination): RechargePlan {
  if (!to.hasCustomer) {
    return { extraLine: false, because: 'Nobody to charge — this is a business cost.' };
  }
  if (to.jobPricing === 'costPlus') {
    // The job already bills it. Adding a charge line as well would bill it
    // twice, so the tick is honoured by the job rather than ignored.
    return {
      extraLine: false,
      because: 'The cost-plus job already bills this, with your margin on top.',
    };
  }
  if (!to.rechargeable) {
    return { extraLine: false, because: 'You are absorbing this one.' };
  }
  return { extraLine: true };
}
