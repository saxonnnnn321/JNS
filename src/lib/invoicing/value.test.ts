import { describe, expect, it } from 'vitest';
import { jobValue, type JobValueInput } from './value';

const fixed: JobValueInput = {
  pricing: 'fixed',
  priceCents: 420_000,
  materialsCents: 138_000,
  labourRateCents: 15_000,
  markupBasisPoints: 1500,
};

const costPlus: JobValueInput = {
  pricing: 'costPlus',
  priceCents: 0,
  materialsCents: 0,
  labourRateCents: 15_000, // $150/hr
  markupBasisPoints: 1500, // 15% on materials
};

describe('jobValue — fixed price', () => {
  it('is the price you quoted, plus materials', () => {
    const value = jobValue(fixed, { minutesWorked: 0, receiptsCents: 0 });
    expect(value.totalCents).toBe(558_000);
    expect(value.isCostPlus).toBe(false);
  });

  it('does not move when the job runs over', () => {
    // The whole point of quoting: the overrun is your risk, not theirs.
    const value = jobValue(fixed, {
      minutesWorked: 100 * 60,
      receiptsCents: 900_000,
    });
    expect(value.totalCents).toBe(558_000);
  });
});

describe('jobValue — cost plus', () => {
  it('bills the hours actually worked at the agreed rate', () => {
    const value = jobValue(costPlus, { minutesWorked: 20 * 60, receiptsCents: 0 });
    expect(value.labourCents).toBe(300_000); // 20h × $150
    expect(value.totalCents).toBe(300_000);
    expect(value.isCostPlus).toBe(true);
  });

  it('adds the materials and the margin on top', () => {
    const value = jobValue(costPlus, {
      minutesWorked: 20 * 60,
      receiptsCents: 200_000,
    });
    expect(value.labourCents).toBe(300_000);
    expect(value.materialsCents).toBe(200_000);
    expect(value.markupCents).toBe(30_000); // 15% of $2,000
    expect(value.totalCents).toBe(530_000);
  });

  it('grows as hours are logged', () => {
    const before = jobValue(costPlus, { minutesWorked: 10 * 60, receiptsCents: 0 });
    const after = jobValue(costPlus, { minutesWorked: 11 * 60, receiptsCents: 0 });
    expect(after.totalCents - before.totalCents).toBe(15_000); // one hour
  });

  it('charges part hours properly', () => {
    const value = jobValue(costPlus, { minutesWorked: 90, receiptsCents: 0 });
    expect(value.labourCents).toBe(22_500); // 1.5h × $150
  });

  it('applies no margin when you have not set one', () => {
    const value = jobValue(
      { ...costPlus, markupBasisPoints: 0 },
      { minutesWorked: 60, receiptsCents: 100_000 },
    );
    expect(value.markupCents).toBe(0);
    expect(value.totalCents).toBe(115_000);
  });

  it('is worth nothing before anyone has worked on it', () => {
    const value = jobValue(costPlus, { minutesWorked: 0, receiptsCents: 0 });
    expect(value.totalCents).toBe(0);
  });

  it('ignores the fixed price fields entirely', () => {
    // A job switched from fixed to cost-plus must not smuggle its old quote in.
    const value = jobValue(
      { ...costPlus, priceCents: 999_999, materialsCents: 999_999 },
      { minutesWorked: 60, receiptsCents: 0 },
    );
    expect(value.totalCents).toBe(15_000);
  });

  it('never goes negative on bad input', () => {
    const value = jobValue(costPlus, { minutesWorked: -100, receiptsCents: -500 });
    expect(value.totalCents).toBe(0);
  });

  it('rounds the margin to the cent, and the parts still add up', () => {
    const value = jobValue(
      { ...costPlus, markupBasisPoints: 1234 },
      { minutesWorked: 37, receiptsCents: 12_345 },
    );
    expect(value.labourCents + value.materialsCents + value.markupCents).toBe(
      value.totalCents,
    );
  });
});
