/**
 * What a job is still worth, once stages of it have been billed.
 *
 * The rule that keeps a customer from being charged twice for the same wall:
 *
 *     remaining = total − every claim ever made against the job
 *
 * "Every claim" means billed AND not-yet-billed. A claim sitting unbilled is
 * about to go on the very next invoice alongside the balance, so counting only
 * the billed ones would bill that amount a second time in the balance line.
 *
 * Pure. No database, no clock.
 */

export type ClaimLike = {
  claimId: string;
  jobId: string;
  amountCents: number;
  /** Set once it has been billed. */
  invoiceId?: string;
};

export type JobLike = {
  id: string;
  priceCents: number;
  materialsCents: number;
};

export type JobLedger = {
  totalCents: number;
  /** Everything claimed so far, billed or not. */
  claimedCents: number;
  /** What is left to bill. Never below zero. */
  remainingCents: number;
  /** True when claims already cover the whole job. */
  fullyClaimed: boolean;
  /** Claims add up to more than the job is worth — worth saying out loud. */
  overClaimed: boolean;
};

export function jobLedger(job: JobLike, claims: ClaimLike[]): JobLedger {
  const totalCents = job.priceCents + job.materialsCents;
  const claimedCents = claims
    .filter((claim) => claim.jobId === job.id)
    .reduce((total, claim) => total + claim.amountCents, 0);

  const rawRemaining = totalCents - claimedCents;

  return {
    totalCents,
    claimedCents,
    // Clamped: over-claiming is a mistake to warn about, not a credit note to
    // quietly issue on the final invoice.
    remainingCents: Math.max(0, rawRemaining),
    fullyClaimed: rawRemaining <= 0,
    overClaimed: rawRemaining < 0,
  };
}
