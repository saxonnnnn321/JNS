import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RETENTION_BASIS_POINTS,
  DEFAULT_WAGE_CENTS_PER_HOUR,
  allocate,
  splitPeriod,
  type PartnerInput,
} from './split';

const saxon = (over: Partial<PartnerInput> = {}): PartnerInput => ({
  id: 'saxon',
  name: 'Saxon',
  shareBasisPoints: 5000,
  wageCentsPerHour: DEFAULT_WAGE_CENTS_PER_HOUR,
  minutesWorked: 30 * 60,
  drawnCents: 0,
  ...over,
});

const john = (over: Partial<PartnerInput> = {}): PartnerInput => ({
  id: 'john',
  name: 'John',
  shareBasisPoints: 5000,
  wageCentsPerHour: DEFAULT_WAGE_CENTS_PER_HOUR,
  minutesWorked: 20 * 60,
  drawnCents: 0,
  ...over,
});

describe('splitPeriod — the worked example', () => {
  // A $6,000 week. Saxon did 30 hours, John did 20.
  const result = splitPeriod({
    incomeCents: 600_000,
    retentionBasisPoints: DEFAULT_RETENTION_BASIS_POINTS,
    partners: [saxon(), john()],
  });

  it('takes the business cut off the top first', () => {
    expect(result.retentionCents).toBe(180_000); // 30% of $6,000
    expect(result.poolCents).toBe(420_000);
  });

  it('pays each partner for the hours they actually did', () => {
    expect(result.partners[0].wageCents).toBe(150_000); // 30h × $50
    expect(result.partners[1].wageCents).toBe(100_000); // 20h × $50
  });

  it('splits what is left equally, regardless of who worked more', () => {
    expect(result.profitCents).toBe(170_000);
    expect(result.partners[0].profitShareCents).toBe(85_000);
    expect(result.partners[1].profitShareCents).toBe(85_000);
  });

  it('leaves the harder worker better off by exactly their extra hours', () => {
    const [s, j] = result.partners;
    expect(s.earnedCents).toBe(235_000); // $2,350
    expect(j.earnedCents).toBe(185_000); // $1,850
    // 10 extra hours at $50 and not a cent more.
    expect(s.earnedCents - j.earnedCents).toBe(10 * DEFAULT_WAGE_CENTS_PER_HOUR);
  });
});

describe('splitPeriod — fairness properties', () => {
  it('pays two partners the same for the same work, to the cent', () => {
    // An odd number of cents cannot be halved exactly, so the most that can
    // ever separate two partners who did identical work is a single cent —
    // and it must never be more than that.
    for (const income of [499_999, 500_000, 500_001, 123_457]) {
      const result = splitPeriod({
        incomeCents: income,
        retentionBasisPoints: 3000,
        partners: [saxon({ minutesWorked: 1234 }), john({ minutesWorked: 1234 })],
      });
      const [a, b] = result.partners;
      expect(Math.abs(a.earnedCents - b.earnedCents)).toBeLessThanOrEqual(1);
      expect(a.wageCents).toBe(b.wageCents);
    }
  });

  it('never loses or invents a cent', () => {
    // Everything the partners earn must add back to the pool exactly. Awkward
    // numbers on purpose: this is where naive rounding goes wrong.
    for (const income of [1, 7, 999, 100_003, 333_333, 6_000_001]) {
      for (const minutes of [0, 1, 37, 601, 2_999]) {
        const result = splitPeriod({
          incomeCents: income,
          retentionBasisPoints: 3333,
          partners: [
            saxon({ minutesWorked: minutes }),
            john({ minutesWorked: minutes + 17 }),
          ],
        });
        const earned = result.partners.reduce((t, p) => t + p.earnedCents, 0);
        expect(earned).toBe(result.poolCents);
        expect(result.retentionCents + result.poolCents).toBe(
          result.incomeCents,
        );
      }
    }
  });

  it('shares a bad week by ownership, not by hours', () => {
    // Wages outrun the income. Both partners wear half the shortfall even
    // though one of them worked far more.
    const result = splitPeriod({
      incomeCents: 100_000,
      retentionBasisPoints: 3000,
      partners: [saxon(), john()],
    });
    expect(result.profitCents).toBeLessThan(0);
    const [s, j] = result.partners;
    expect(s.profitShareCents).toBe(j.profitShareCents);
    expect(result.warnings.join(' ')).toMatch(/more than the business took in/);
  });

  it('honours an uneven ownership split', () => {
    const result = splitPeriod({
      incomeCents: 600_000,
      retentionBasisPoints: 3000,
      partners: [
        saxon({ shareBasisPoints: 6000, minutesWorked: 0 }),
        john({ shareBasisPoints: 4000, minutesWorked: 0 }),
      ],
    });
    expect(result.partners[0].profitShareCents).toBe(252_000); // 60%
    expect(result.partners[1].profitShareCents).toBe(168_000); // 40%
  });

  it('says so when the shares do not add up to a whole business', () => {
    const result = splitPeriod({
      incomeCents: 100_000,
      retentionBasisPoints: 3000,
      partners: [saxon({ shareBasisPoints: 5000 }), john({ shareBasisPoints: 4000 })],
    });
    expect(result.warnings.join(' ')).toMatch(/not 100%/);
  });
});

describe('splitPeriod — settling up', () => {
  it('works out who puts money back and who is owed', () => {
    const result = splitPeriod({
      incomeCents: 600_000,
      retentionBasisPoints: DEFAULT_RETENTION_BASIS_POINTS,
      partners: [
        saxon({ drawnCents: 280_000 }), // took $2,800, earned $2,350
        john({ drawnCents: 140_000 }), // took $1,400, earned $1,850
      ],
    });

    const [s, j] = result.partners;
    expect(s.balanceCents).toBe(-45_000); // Saxon is $450 over
    expect(j.balanceCents).toBe(45_000); // John is $450 short

    expect(result.settlement).toEqual({
      fromId: 'saxon',
      fromName: 'Saxon',
      toId: 'john',
      toName: 'John',
      amountCents: 45_000,
    });
  });

  it('asks for no payment when both have drawn what they earned', () => {
    const result = splitPeriod({
      incomeCents: 600_000,
      retentionBasisPoints: DEFAULT_RETENTION_BASIS_POINTS,
      partners: [saxon({ drawnCents: 235_000 }), john({ drawnCents: 185_000 })],
    });
    expect(result.settlement).toBeNull();
    expect(result.partners.every((p) => p.balanceCents === 0)).toBe(true);
  });

  it('never asks for more than the other partner is short', () => {
    // Saxon is way over, but John has only been short-changed a little, so
    // only that much moves between them — the rest is between Saxon and the
    // business.
    const result = splitPeriod({
      incomeCents: 600_000,
      retentionBasisPoints: DEFAULT_RETENTION_BASIS_POINTS,
      partners: [
        saxon({ drawnCents: 400_000 }), // $1,650 over
        john({ drawnCents: 184_000 }), // $10 short
      ],
    });
    expect(result.settlement?.amountCents).toBe(1_000); // $10, not $1,650
  });
});

describe('allocate', () => {
  it('hands out every last cent', () => {
    expect(allocate(100, [5000, 5000])).toEqual([50, 50]);
    expect(allocate(101, [5000, 5000])).toEqual([51, 50]);
    expect(allocate(1, [5000, 5000])).toEqual([1, 0]);
  });

  it('splits a loss the same way it splits a profit', () => {
    expect(allocate(-101, [5000, 5000])).toEqual([-51, -50]);
  });

  it('adds back to the total for any weights', () => {
    for (const total of [-9999, -1, 0, 1, 7, 12_345, 1_000_000]) {
      for (const weights of [[1, 1], [6000, 4000], [1, 2, 3], [9999, 1]]) {
        const parts = allocate(total, weights);
        expect(parts.reduce((t, p) => t + p, 0)).toBe(total);
      }
    }
  });

  it('copes with nobody owning anything', () => {
    expect(allocate(500, [0, 0])).toEqual([0, 0]);
    expect(allocate(500, [])).toEqual([]);
  });
});
