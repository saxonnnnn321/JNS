import { describe, expect, it } from 'vitest';
import { lapse, matchesSearch, tightestCycle } from './directory';

describe('matchesSearch', () => {
  const fields = ['Dave Thompson', '12 Short Street', 'Emu Plains', '0412 345 678'];

  it('matches an empty query, so a blank box shows everyone', () => {
    expect(matchesSearch('', fields)).toBe(true);
    expect(matchesSearch('   ', fields)).toBe(true);
  });

  it('finds a name across fields, in any order', () => {
    expect(matchesSearch('dave emu', fields)).toBe(true);
    expect(matchesSearch('emu dave', fields)).toBe(true);
  });

  it('matches part of a street or suburb', () => {
    expect(matchesSearch('short', fields)).toBe(true);
    expect(matchesSearch('plain', fields)).toBe(true);
  });

  it('needs every word, so an unrelated word rules them out', () => {
    expect(matchesSearch('dave penrith', fields)).toBe(false);
  });

  it('ignores missing fields rather than crashing on them', () => {
    expect(matchesSearch('dave', ['Dave', null, undefined])).toBe(true);
  });
});

describe('lapse', () => {
  it('never flags someone who is not on the round', () => {
    expect(
      lapse({ today: '2026-09-25', onTheRound: false, lastVisit: '2020-01-01' })
        .lapsed,
    ).toBe(false);
  });

  it('gives a weekly customer two weeks of grace, not thirty days', () => {
    const args = { today: '2026-09-25', onTheRound: true, frequency: 'weekly' } as const;
    // 14 days: one missed visit, could be rain.
    expect(lapse({ ...args, lastVisit: '2026-09-11' }).lapsed).toBe(false);
    // 15 days: two missed, nobody has been.
    expect(lapse({ ...args, lastVisit: '2026-09-10' }).lapsed).toBe(true);
  });

  it('does not flag a monthly customer who a weekly one would fail on', () => {
    const lastVisit = '2026-09-01'; // 24 days back
    expect(
      lapse({ today: '2026-09-25', onTheRound: true, frequency: 'monthly', lastVisit })
        .lapsed,
    ).toBe(false);
    expect(
      lapse({ today: '2026-09-25', onTheRound: true, frequency: 'weekly', lastVisit })
        .lapsed,
    ).toBe(true);
  });

  it('flags a plan that has never produced a visit', () => {
    const result = lapse({
      today: '2026-09-25',
      onTheRound: true,
      frequency: 'fortnightly',
    });
    expect(result.lapsed).toBe(true);
    expect(result.label).toMatch(/no visit recorded/i);
  });

  it('counts the days so the label can say how long', () => {
    expect(
      lapse({
        today: '2026-09-25',
        onTheRound: true,
        frequency: 'weekly',
        lastVisit: '2026-08-25',
      }).daysSince,
    ).toBe(31);
  });
});

describe('tightestCycle', () => {
  it('judges someone by their shortest active plan', () => {
    expect(
      tightestCycle([
        { frequency: 'monthly', active: true },
        { frequency: 'weekly', active: true },
      ]),
    ).toBe('weekly');
  });

  it('ignores paused plans and one-offs', () => {
    expect(
      tightestCycle([
        { frequency: 'weekly', active: false },
        { frequency: 'onceOff', active: true },
      ]),
    ).toBeUndefined();
  });
});
