/**
 * Working out who is owed what, between two partners who both do the work.
 *
 * The problem this solves: Saxon and John own the business half each, but in
 * any given week one of them will have done more hours than the other. Paying
 * them the same is unfair to whoever worked more; splitting everything by
 * hours is unfair to whoever owns half a business. So the money is separated
 * into the two different things it is actually paying for:
 *
 *   1. A WAGE for hours worked. Unequal on purpose — more hours, more money.
 *      This is payment for doing the job.
 *
 *   2. A PROFIT SHARE for owning the business. Split by ownership, normally
 *      half each, and nothing to do with who did the mowing.
 *
 * Before either of those, the business keeps a slice of the income for fuel,
 * insurance, gear, repairs and the tax that is coming whether you like it or
 * not. That money never belongs to either partner.
 *
 * The order is deliberate and it matters:
 *
 *      income
 *    − business retention        (a % off the top)
 *    = the pool
 *    − wages for hours worked    (each partner's own rate × their hours)
 *    = profit, split by ownership
 *
 * Finally, neither partner draws exactly what they earned — real life is
 * taking cash out when you need it. So each partner has a running balance:
 * what they earned, less what they have actually taken. A negative balance is
 * money to put back; a positive one is money still owed to them.
 *
 * Every figure is in CENTS and every division is allocated so the parts add
 * back to the whole exactly. Nobody loses a cent to rounding, and the totals
 * always reconcile.
 */

/** Ownership and percentages are basis points: 10000 = 100%, 5000 = 50%. */
export const FULL_SHARE = 10_000;

/** A sensible starting point; both are settings, not laws. */
export const DEFAULT_RETENTION_BASIS_POINTS = 3_000; // 30% to the business
export const DEFAULT_WAGE_CENTS_PER_HOUR = 5_000; // $50/hr

export type PartnerInput = {
  id: string;
  name: string;
  /** Ownership. Across all partners these should total 10000. */
  shareBasisPoints: number;
  wageCentsPerHour: number;
  minutesWorked: number;
  /** What they have actually taken out of the business this period. */
  drawnCents: number;
};

export type PartnerSplit = {
  id: string;
  name: string;
  minutesWorked: number;
  /** Paid for the hours they did. */
  wageCents: number;
  /** Their cut of what was left, by ownership. Negative in a bad period. */
  profitShareCents: number;
  /** wage + profit share. What the period actually earned them. */
  earnedCents: number;
  drawnCents: number;
  /** earned − drawn. Negative means they owe it back. */
  balanceCents: number;
};

export type Settlement = {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amountCents: number;
};

export type SplitResult = {
  incomeCents: number;
  retentionCents: number;
  poolCents: number;
  wagesCents: number;
  profitCents: number;
  partners: PartnerSplit[];
  /** The single payment that squares the two of them up, if one is needed. */
  settlement: Settlement | null;
  /** Things worth saying out loud before anyone moves money. */
  warnings: string[];
};

/**
 * Split a total into parts by weight, exactly.
 *
 * Rounding each share independently loses or invents cents — three ways of
 * $100 becomes $99.99. This hands out the floor of each share and then gives
 * the leftover cents to whoever was rounded down hardest, so the parts always
 * add back to the total.
 */
export function allocate(totalCents: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 0) return weights.map(() => 0);

  // Work on the magnitude so a loss splits the same way a profit does.
  const sign = totalCents < 0 ? -1 : 1;
  const magnitude = Math.abs(totalCents);

  const exact = weights.map((weight) => (magnitude * weight) / totalWeight);
  const floors = exact.map(Math.floor);
  let remainder = magnitude - floors.reduce((sum, value) => sum + value, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = [...floors];
  for (const { index } of order) {
    if (remainder <= 0) break;
    result[index] += 1;
    remainder -= 1;
  }

  return result.map((value) => value * sign);
}

export function splitPeriod({
  incomeCents,
  retentionBasisPoints,
  partners,
}: {
  incomeCents: number;
  retentionBasisPoints: number;
  partners: PartnerInput[];
}): SplitResult {
  const warnings: string[] = [];

  const income = Math.max(0, Math.round(incomeCents));
  const retention = Math.round((income * retentionBasisPoints) / FULL_SHARE);
  const pool = income - retention;

  const wages = partners.map((partner) =>
    Math.round((partner.minutesWorked / 60) * partner.wageCentsPerHour),
  );
  const wagesCents = wages.reduce((sum, wage) => sum + wage, 0);

  const profitCents = pool - wagesCents;
  const profitShares = allocate(
    profitCents,
    partners.map((partner) => partner.shareBasisPoints),
  );

  const split: PartnerSplit[] = partners.map((partner, index) => {
    const wageCents = wages[index];
    const profitShareCents = profitShares[index];
    const earnedCents = wageCents + profitShareCents;
    return {
      id: partner.id,
      name: partner.name,
      minutesWorked: partner.minutesWorked,
      wageCents,
      profitShareCents,
      earnedCents,
      drawnCents: partner.drawnCents,
      balanceCents: earnedCents - partner.drawnCents,
    };
  });

  // ---- things worth saying before anyone moves money -----------------------

  const shareTotal = partners.reduce((sum, p) => sum + p.shareBasisPoints, 0);
  if (partners.length > 0 && shareTotal !== FULL_SHARE) {
    warnings.push(
      `The ownership shares add up to ${(shareTotal / 100).toFixed(1)}%, not 100%. Fix that before trusting these numbers.`,
    );
  }

  if (income === 0 && partners.some((p) => p.minutesWorked > 0)) {
    warnings.push(
      'No income recorded for this period, so the hours below have nothing to be paid out of.',
    );
  }

  if (profitCents < 0) {
    warnings.push(
      'The wages for these hours come to more than the business took in. The shortfall is shared by ownership, which is why the profit share is negative — a quiet week costs you both.',
    );
  }

  const totalDrawn = partners.reduce((sum, p) => sum + p.drawnCents, 0);
  if (totalDrawn > pool && pool >= 0) {
    warnings.push(
      'Between you, more has been drawn than the business had to give after its own cut.',
    );
  }

  return {
    incomeCents: income,
    retentionCents: retention,
    poolCents: pool,
    wagesCents,
    profitCents,
    partners: split,
    settlement: settleUp(split),
    warnings,
  };
}

/**
 * The one payment that squares two partners up.
 *
 * Only offered for exactly two partners, and only when one is ahead and the
 * other behind — that is the case this business has, and a three-way
 * settlement is a different problem that should not be guessed at.
 */
export function settleUp(partners: PartnerSplit[]): Settlement | null {
  if (partners.length !== 2) return null;

  const [a, b] = partners;
  const behind = a.balanceCents < 0 ? a : b.balanceCents < 0 ? b : null;
  const ahead = a.balanceCents > 0 ? a : b.balanceCents > 0 ? b : null;
  if (!behind || !ahead || behind.id === ahead.id) return null;

  // Whoever has overdrawn can only hand over what the other is actually short.
  const amountCents = Math.min(Math.abs(behind.balanceCents), ahead.balanceCents);
  if (amountCents <= 0) return null;

  return {
    fromId: behind.id,
    fromName: behind.name,
    toId: ahead.id,
    toName: ahead.name,
    amountCents,
  };
}
