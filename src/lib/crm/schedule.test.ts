import { describe, expect, it } from 'vitest';
import {
  dayName,
  daysBetween,
  dueDates,
  estimateAccuracy,
  roundBetween,
  weekStart,
  weeklyRecurringCents,
} from './schedule';
import type { ServicePlan, Visit } from './types';

// 2026-09-21 is a Monday.
const MONDAY = '2026-09-21';

function plan(overrides: Partial<ServicePlan> = {}): ServicePlan {
  return {
    id: 'p1',
    customerId: 'c1',
    propertyId: 'pr1',
    frequency: 'fortnightly',
    anchorDate: MONDAY,
    packageKey: 'standard',
    priceCents: 30000,
    estimatedMinutes: 90,
    active: true,
    ...overrides,
  };
}

describe('round scheduling', () => {
  it('knows the week starts on Monday', () => {
    expect(weekStart('2026-09-21')).toBe('2026-09-21'); // Monday itself
    expect(weekStart('2026-09-24')).toBe('2026-09-21'); // Thursday
    expect(weekStart('2026-09-27')).toBe('2026-09-21'); // Sunday
    expect(weekStart('2026-09-28')).toBe('2026-09-28'); // next Monday
  });

  it('counts days across a month boundary', () => {
    expect(daysBetween('2026-09-21', '2026-10-05')).toBe(14);
    expect(daysBetween('2026-10-05', '2026-09-21')).toBe(-14);
  });

  it('repeats weekly on the same weekday', () => {
    const dates = dueDates(plan({ frequency: 'weekly' }), MONDAY, '2026-10-19');
    expect(dates).toEqual([
      '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19',
    ]);
    expect(new Set(dates.map(dayName))).toEqual(new Set(['Monday']));
  });

  it('repeats fortnightly', () => {
    expect(dueDates(plan(), MONDAY, '2026-10-19')).toEqual([
      '2026-09-21', '2026-10-05', '2026-10-19',
    ]);
  });

  it('treats monthly as every 28 days so it stays on its weekday', () => {
    const dates = dueDates(plan({ frequency: 'monthly' }), MONDAY, '2026-12-14');
    expect(dates).toEqual(['2026-09-21', '2026-10-19', '2026-11-16', '2026-12-14']);
    expect(new Set(dates.map(dayName))).toEqual(new Set(['Monday']));
  });

  it('finds the right occurrences for a window far from the anchor', () => {
    // A plan anchored years ago must not need a loop from the anchor.
    const old = plan({ anchorDate: '2020-01-06', frequency: 'fortnightly' });
    const dates = dueDates(old, '2026-09-21', '2026-10-05');
    for (const date of dates) {
      expect(daysBetween('2020-01-06', date) % 14).toBe(0);
    }
    expect(dates.length).toBeGreaterThan(0);
  });

  it('honours a pause and an inactive plan', () => {
    expect(
      dueDates(plan({ frequency: 'weekly', pausedUntil: '2026-10-01' }), MONDAY, '2026-10-12'),
    ).toEqual(['2026-10-05', '2026-10-12']);

    expect(dueDates(plan({ active: false }), MONDAY, '2026-12-31')).toEqual([]);
  });

  it('runs a one-off exactly once', () => {
    const once = plan({ frequency: 'onceOff' });
    expect(dueDates(once, MONDAY, '2026-12-31')).toEqual([MONDAY]);
    expect(dueDates(once, '2026-09-22', '2026-12-31')).toEqual([]);
  });

  it('sorts a day of work by suburb so the driving makes sense', () => {
    const lookup = {
      plans: [plan({ id: 'a', propertyId: 'far' }), plan({ id: 'b', propertyId: 'near' })],
      customerById: () => ({ id: 'c1', name: 'Test', since: '2025-01-01' }),
      propertyById: (id: string) =>
        id === 'far'
          ? { id, customerId: 'c1', addressLine: '1 A St', suburb: 'Werrington', state: 'NSW', postcode: '2747' }
          : { id, customerId: 'c1', addressLine: '2 B St', suburb: 'Emu Plains', state: 'NSW', postcode: '2750' },
    };
    const stops = roundBetween(lookup, MONDAY, MONDAY);
    expect(stops.map((s) => s.property.suburb)).toEqual(['Emu Plains', 'Werrington']);
  });

  it('values the round per week across mixed cycles', () => {
    const cents = weeklyRecurringCents([
      plan({ frequency: 'weekly', priceCents: 10000 }),      // 100/wk
      plan({ frequency: 'fortnightly', priceCents: 10000 }), // 50/wk
      plan({ frequency: 'monthly', priceCents: 28000 }),     // 70/wk
      plan({ frequency: 'onceOff', priceCents: 99900 }),     // ignored
      plan({ active: false, priceCents: 99900 }),            // ignored
    ]);
    expect(Math.round(cents)).toBe(22000);
  });
});

describe('estimateAccuracy', () => {
  it('is null until something has actually been done', () => {
    expect(estimateAccuracy([], () => 100)).toBeNull();
    const scheduled: Visit[] = [
      { id: 'v', planId: 'p1', date: '2026-09-21', status: 'scheduled' },
    ];
    expect(estimateAccuracy(scheduled, () => 100)).toBeNull();
  });

  it('measures how far the rate card is off', () => {
    const done: Visit[] = [
      { id: 'a', planId: 'p1', date: '2026-09-07', status: 'done', actualMinutes: 110 },
      { id: 'b', planId: 'p1', date: '2026-09-14', status: 'done', actualMinutes: 130 },
      { id: 'c', planId: 'p1', date: '2026-09-21', status: 'skipped' },
    ];
    const result = estimateAccuracy(done, () => 100);
    expect(result!.visits).toBe(2);
    expect(result!.ratio).toBeCloseTo(1.2, 5);
    expect(result!.medianOverrunMinutes).toBe(20);
  });
});
