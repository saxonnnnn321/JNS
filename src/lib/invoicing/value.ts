/**
 * What a job is worth.
 *
 * Two ways of arriving at a number, and the difference matters:
 *
 *   FIXED — you quoted it. The price is the price, agreed before a shovel
 *   went in the ground, and it does not move because the job took longer
 *   than you thought. That is the risk you took when you quoted.
 *
 *   COST PLUS — you did not quote. The job is worth the hours actually spent
 *   on it at the agreed rate, plus what the materials actually cost, plus a
 *   margin on those materials. The number is discovered as the job runs, so
 *   it changes every time an hour is logged or a receipt is filed.
 *
 * Pure: hours and materials come in as totals, so this can be tested without
 * a database and reused for both the on-screen figure and the invoice.
 */

export const FULL_MARGIN = 10_000; // basis points

export type JobPricing = 'fixed' | 'costPlus';

export type JobValueInput = {
  pricing: JobPricing;
  /** Fixed jobs only. */
  priceCents: number;
  /** Fixed jobs: the materials figure you typed in. */
  materialsCents: number;
  /** Cost-plus only. */
  labourRateCents: number;
  markupBasisPoints: number;
};

export type JobActuals = {
  /** Hours logged against this job, in minutes. */
  minutesWorked: number;
  /** What the receipts filed against this job add up to. */
  receiptsCents: number;
};

export type JobValue = {
  labourCents: number;
  materialsCents: number;
  markupCents: number;
  totalCents: number;
  isCostPlus: boolean;
};

export function jobValue(job: JobValueInput, actuals: JobActuals): JobValue {
  if (job.pricing !== 'costPlus') {
    return {
      // A fixed job's price already covers the labour; splitting it out
      // would be inventing a breakdown nobody agreed to.
      labourCents: job.priceCents,
      materialsCents: job.materialsCents,
      markupCents: 0,
      totalCents: job.priceCents + job.materialsCents,
      isCostPlus: false,
    };
  }

  const labourCents = Math.round(
    (Math.max(0, actuals.minutesWorked) / 60) * job.labourRateCents,
  );
  const materialsCents = Math.max(0, actuals.receiptsCents);
  const markupCents = Math.round(
    (materialsCents * job.markupBasisPoints) / FULL_MARGIN,
  );

  return {
    labourCents,
    materialsCents,
    markupCents,
    totalCents: labourCents + materialsCents + markupCents,
    isCostPlus: true,
  };
}
