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

/**
 * Takes a total rather than a price, because a cost-plus job has no price —
 * it is worth whatever the hours and materials have come to so far. See
 * lib/invoicing/value.ts, which works that figure out.
 */
export type JobLike = {
  id: string;
  totalCents: number;
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
  const totalCents = Math.max(0, job.totalCents);
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

/**
 * May this stage be claimed?
 *
 * Split out from the server action because the rule it replaced was wrong in a
 * way nothing caught: it capped a claim at the job's *price*, and a cost-plus
 * job has no price. Every cost-plus job was therefore worth $0 here, and every
 * stage on one was refused — on exactly the jobs progress claims exist for.
 *
 * Pure, so the rule is pinned by tests rather than by trying it in production.
 */
export type ClaimCheck =
  | { ok: true }
  | { ok: false; reason: 'nothingLogged' | 'overClaim'; remainingCents: number };

export function checkClaim(input: {
  /** What the job is worth now, from `jobValue`. */
  value: { totalCents: number; isCostPlus: boolean };
  /** Every claim already on it, billed or not. */
  claimedCents: number;
  amountCents: number;
}): ClaimCheck {
  const remainingCents = input.value.totalCents - input.claimedCents;

  // A cost-plus job with no hours and no receipts is not worth nothing — it is
  // not yet measured. Saying "only $0.00 is left" would be misleading.
  if (input.value.isCostPlus && input.value.totalCents === 0) {
    return { ok: false, reason: 'nothingLogged', remainingCents: 0 };
  }
  if (input.amountCents > remainingCents) {
    return { ok: false, reason: 'overClaim', remainingCents };
  }
  return { ok: true };
}
