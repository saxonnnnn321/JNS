/**
 * Finding people in the customer list, and noticing the ones going quiet.
 *
 * Both of these used to be a note at the bottom of the customers page saying
 * a real version would have them. They are here now because the list is the
 * screen you open most, and scrolling it is the wrong way to use it once there
 * are more than a dozen names on the books.
 *
 * Pure, so both can be tested without a database.
 */

import { daysBetween } from './schedule';
import type { Frequency } from './types';

const INTERVAL_DAYS: Record<Exclude<Frequency, 'onceOff'>, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 28,
};

/**
 * Does this customer match what was typed in the search box?
 *
 * Every word has to appear somewhere, in any of the fields — so "dave emu"
 * finds Dave in Emu Plains, and a partial suburb or street works too. Matching
 * is loose on purpose: you are usually typing one-handed in the ute.
 */
export function matchesSearch(
  query: string,
  fields: (string | null | undefined)[],
): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const haystack = fields
    .filter((field): field is string => Boolean(field))
    .join(' ')
    .toLowerCase();

  return words.every((word) => haystack.includes(word));
}

export type Lapse = {
  /** Overdue by their own cycle, not by some fixed number of days. */
  lapsed: boolean;
  /** Days since the last completed visit, when there has been one. */
  daysSince?: number;
  /** What to put on screen. */
  label?: string;
};

/**
 * Has this customer gone quiet?
 *
 * Judged against their own cycle rather than a flat 30 days, because a monthly
 * customer three days late is fine and a weekly customer three weeks late is
 * not. The allowance is twice the cycle: one missed visit is a rain day or a
 * holiday, two in a row means nobody has been.
 *
 * Someone with no active plan cannot lapse — a construction customer is not
 * neglected just because there is no standing mow.
 */
export function lapse(input: {
  today: string;
  /** The most recent completed visit, if there has ever been one. */
  lastVisit?: string;
  /** Their shortest active cycle. Undefined means they are not on the round. */
  frequency?: Frequency;
  /** Have they got an active plan at all? */
  onTheRound: boolean;
}): Lapse {
  if (!input.onTheRound) return { lapsed: false };

  const cycle =
    input.frequency && input.frequency !== 'onceOff'
      ? INTERVAL_DAYS[input.frequency]
      : undefined;
  if (!cycle) return { lapsed: false };

  if (!input.lastVisit) {
    // On the round with nothing recorded. Either the plan is wrong or the
    // visits are not being ticked off, and both are worth knowing. Worded as
    // "no visit recorded" rather than "never visited" because the round only
    // holds a window of recent history, not all of it.
    return { lapsed: true, label: 'On the round, no visit recorded' };
  }

  const daysSince = daysBetween(input.lastVisit, input.today);
  if (daysSince <= cycle * 2) return { lapsed: false, daysSince };

  return {
    lapsed: true,
    daysSince,
    label: `Not visited in ${daysSince} days`,
  };
}

/** Their shortest active cycle, which is the one to judge them by. */
export function tightestCycle(
  plans: { frequency: Frequency; active: boolean }[],
): Frequency | undefined {
  const active = plans
    .filter((plan) => plan.active && plan.frequency !== 'onceOff')
    .map((plan) => plan.frequency as Exclude<Frequency, 'onceOff'>);
  if (active.length === 0) return undefined;
  return active.reduce((best, frequency) =>
    INTERVAL_DAYS[frequency] < INTERVAL_DAYS[best] ? frequency : best,
  );
}
