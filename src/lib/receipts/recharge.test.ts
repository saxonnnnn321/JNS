import { describe, expect, it } from 'vitest';
import { rechargePlan } from './recharge';

describe('rechargePlan', () => {
  it('makes a charge line for a ticked receipt against no particular job', () => {
    expect(
      rechargePlan({ hasCustomer: true, rechargeable: true }).extraLine,
    ).toBe(true);
  });

  it('makes a charge line on a fixed-price job, which does not bill receipts', () => {
    expect(
      rechargePlan({ hasCustomer: true, rechargeable: true, jobPricing: 'fixed' })
        .extraLine,
    ).toBe(true);
  });

  it('makes NO charge line on a cost-plus job — the job already bills it', () => {
    const plan = rechargePlan({
      hasCustomer: true,
      rechargeable: true,
      jobPricing: 'costPlus',
    });
    expect(plan.extraLine).toBe(false);
    expect(plan.because).toMatch(/already bills/i);
  });

  it('never charges a business cost, however the tick is left', () => {
    expect(
      rechargePlan({ hasCustomer: false, rechargeable: true }).extraLine,
    ).toBe(false);
  });

  it('respects absorbing one you could have charged', () => {
    expect(
      rechargePlan({ hasCustomer: true, rechargeable: false }).extraLine,
    ).toBe(false);
  });
});
