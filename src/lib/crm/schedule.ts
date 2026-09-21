/**
 * The round: working out who is due, and when.
 *
 * Pure date arithmetic on 'YYYY-MM-DD' calendar dates in NSW terms — no Date
 * objects crossing a timezone boundary, for the same reason the quote dates
 * do not (see ../dates.ts).
 *
 * "Monthly" here means every 28 days, not the same date each month. A mowing
 * round is organised by weekday — Tuesday is the Penrith run — and a true
 * calendar month would walk the visit across the week and wreck the routing.
 */

import { addDays, businessDate } from '../dates';
import type { Frequency, RoundStop, ServicePlan, Visit } from './types';

const INTERVAL_DAYS: Record<Exclude<Frequency, 'onceOff'>, number> = {
  weekly: 7,
  fortnightly: 14,
  monthly: 28,
};

export function daysBetween(from: string, to: string): number {
  const parse = (date: string) => {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** Monday of the week a date falls in. Rounds run Monday to Friday. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

export function dayName(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Every date this plan is due between `from` and `to`, inclusive. */
export function dueDates(plan: ServicePlan, from: string, to: string): string[] {
  if (!plan.active) return [];

  if (plan.frequency === 'onceOff') {
    const due = plan.anchorDate;
    return due >= from && due <= to && !isPaused(plan, due) ? [due] : [];
  }

  const interval = INTERVAL_DAYS[plan.frequency];
  const offset = daysBetween(plan.anchorDate, from);

  // First occurrence on or after `from`, without looping from the anchor.
  let cursor =
    offset <= 0
      ? plan.anchorDate
      : addDays(plan.anchorDate, Math.ceil(offset / interval) * interval);

  const dates: string[] = [];
  while (cursor <= to) {
    if (cursor >= from && !isPaused(plan, cursor)) dates.push(cursor);
    cursor = addDays(cursor, interval);
  }
  return dates;
}

function isPaused(plan: ServicePlan, date: string): boolean {
  return plan.pausedUntil !== undefined && date <= plan.pausedUntil;
}

export interface RoundLookup {
  plans: ServicePlan[];
  customerById: (id: string) => RoundStop['customer'] | undefined;
  propertyById: (id: string) => RoundStop['property'] | undefined;
}

/** Everything due in a date range, sorted by date then suburb. */
export function roundBetween(
  lookup: RoundLookup,
  from: string,
  to: string,
): RoundStop[] {
  const stops: RoundStop[] = [];
  for (const plan of lookup.plans) {
    const customer = lookup.customerById(plan.customerId);
    const property = lookup.propertyById(plan.propertyId);
    if (!customer || !property) continue;
    for (const date of dueDates(plan, from, to)) {
      stops.push({ plan, customer, property, date });
    }
  }
  // Grouping a day's work by suburb is the poor man's route optimisation, and
  // for a one-ute operation it gets most of the benefit.
  return stops.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.property.suburb.localeCompare(b.property.suburb) ||
      a.property.addressLine.localeCompare(b.property.addressLine),
  );
}

export function roundForDay(lookup: RoundLookup, date: string): RoundStop[] {
  return roundBetween(lookup, date, date);
}

export function today(): string {
  return businessDate();
}

/** What the round is worth per week, for plans of every cycle length. */
export function weeklyRecurringCents(plans: ServicePlan[]): number {
  return plans.reduce((total, plan) => {
    if (!plan.active || plan.frequency === 'onceOff') return total;
    const perWeek = 7 / INTERVAL_DAYS[plan.frequency];
    return total + plan.priceCents * perWeek;
  }, 0);
}

/** Visits completed but not yet invoiced — the money sitting on the ute floor. */
export function unbilledVisits(visits: Visit[]): Visit[] {
  return visits.filter((v) => v.status === 'done' && !v.invoiceId);
}

export interface Accuracy {
  visits: number;
  /** Mean of actual ÷ estimated. Above 1 means jobs run longer than quoted. */
  ratio: number;
  medianOverrunMinutes: number;
}

/**
 * How well the rate card matches reality.
 *
 * This is the number that eventually replaces every seed guess in
 * `rate-card.ts` with something measured. Until there are enough completed
 * visits it is noise — hence the count sitting next to it on screen.
 */
export function estimateAccuracy(
  visits: Visit[],
  estimatedMinutesFor: (planId: string) => number | undefined,
): Accuracy | null {
  const ratios: number[] = [];
  const overruns: number[] = [];

  for (const visit of visits) {
    if (visit.status !== 'done' || visit.actualMinutes === undefined) continue;
    const estimated = estimatedMinutesFor(visit.planId);
    if (!estimated || estimated <= 0) continue;
    ratios.push(visit.actualMinutes / estimated);
    overruns.push(visit.actualMinutes - estimated);
  }

  if (ratios.length === 0) return null;

  const sorted = [...overruns].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    visits: ratios.length,
    ratio: ratios.reduce((a, b) => a + b, 0) / ratios.length,
    medianOverrunMinutes:
      sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
  };
}
