import { describe, expect, it } from 'vitest';
import { checkClaim, jobLedger, type ClaimLike, type JobLike } from './claims';

const job: JobLike = { id: 'j1', totalCents: 2_000_000 };

const claim = (over: Partial<ClaimLike> = {}): ClaimLike => ({
  claimId: 'c1',
  jobId: 'j1',
  amountCents: 500_000,
  ...over,
});

describe('jobLedger', () => {
  it('leaves the whole job outstanding when nothing is claimed', () => {
    const ledger = jobLedger(job, []);
    expect(ledger.totalCents).toBe(2_000_000);
    expect(ledger.claimedCents).toBe(0);
    expect(ledger.remainingCents).toBe(2_000_000);
  });

  it('counts a claim that has already been invoiced', () => {
    const ledger = jobLedger(job, [claim({ invoiceId: 'inv1' })]);
    expect(ledger.remainingCents).toBe(1_500_000);
  });

  it('counts a claim that has NOT been invoiced yet', () => {
    // The dangerous case. This claim is about to be billed on the same
    // invoice as the balance, so it must be deducted now — otherwise that
    // $5,000 goes out twice on one piece of paper.
    const ledger = jobLedger(job, [claim()]);
    expect(ledger.remainingCents).toBe(1_500_000);
  });

  it('adds several stages up', () => {
    const ledger = jobLedger(job, [
      claim({ claimId: 'a', amountCents: 500_000, invoiceId: 'inv1' }),
      claim({ claimId: 'b', amountCents: 400_000, invoiceId: 'inv2' }),
      claim({ claimId: 'c', amountCents: 300_000 }),
    ]);
    expect(ledger.claimedCents).toBe(1_200_000);
    expect(ledger.remainingCents).toBe(800_000);
  });

  it('ignores claims belonging to a different job', () => {
    const ledger = jobLedger(job, [
      claim({ claimId: 'a' }),
      claim({ claimId: 'b', jobId: 'someone-elses-wall', amountCents: 900_000 }),
    ]);
    expect(ledger.remainingCents).toBe(1_500_000);
  });

  it('works off whatever the job is worth, however that was arrived at', () => {
    // A cost-plus job has no quoted price — its total is computed from hours
    // and materials by lib/invoicing/value.ts and handed in here.
    const ledger = jobLedger({ id: 'j1', totalCents: 2_138_000 }, [claim()]);
    expect(ledger.totalCents).toBe(2_138_000);
    expect(ledger.remainingCents).toBe(1_638_000);
  });

  it('knows when the job is fully claimed', () => {
    const ledger = jobLedger(job, [claim({ amountCents: 2_000_000 })]);
    expect(ledger.remainingCents).toBe(0);
    expect(ledger.fullyClaimed).toBe(true);
    expect(ledger.overClaimed).toBe(false);
  });

  it('flags over-claiming instead of issuing a silent credit', () => {
    // Claiming more than the job is worth is a typo, not a refund. The final
    // invoice must not quietly hand money back.
    const ledger = jobLedger(job, [claim({ amountCents: 2_500_000 })]);
    expect(ledger.remainingCents).toBe(0);
    expect(ledger.overClaimed).toBe(true);
  });

  it('never lets the stages plus the balance exceed the job', () => {
    // The property that actually matters: across every invoice, the customer
    // pays the agreed price exactly once.
    for (const stages of [[300_000], [500_000, 500_000], [1_999_999], [1, 2, 3]]) {
      const claims = stages.map((amountCents, index) =>
        claim({ claimId: `c${index}`, amountCents }),
      );
      const ledger = jobLedger(job, claims);
      expect(ledger.claimedCents + ledger.remainingCents).toBe(ledger.totalCents);
    }
  });
});

describe('checkClaim', () => {
  const fixed = { totalCents: 420_000, isCostPlus: false };

  it('allows a stage inside what the job is worth', () => {
    expect(
      checkClaim({ value: fixed, claimedCents: 0, amountCents: 200_000 }),
    ).toEqual({ ok: true });
  });

  it('allows a stage that exactly finishes the job off', () => {
    expect(
      checkClaim({ value: fixed, claimedCents: 220_000, amountCents: 200_000 }),
    ).toEqual({ ok: true });
  });

  it('refuses one cent more than the job is worth', () => {
    const result = checkClaim({
      value: fixed,
      claimedCents: 220_000,
      amountCents: 200_001,
    });
    expect(result).toMatchObject({ ok: false, reason: 'overClaim' });
  });

  it('lets a cost-plus job be claimed against what has been logged', () => {
    // 20 hours at $150 = $3,000 logged. Claiming $1,000 of it is fine.
    expect(
      checkClaim({
        value: { totalCents: 300_000, isCostPlus: true },
        claimedCents: 0,
        amountCents: 100_000,
      }),
    ).toEqual({ ok: true });
  });

  it('says a bare cost-plus job is unmeasured, not worth nothing', () => {
    // This is the case that used to refuse every claim with "only $0.00 left".
    expect(
      checkClaim({
        value: { totalCents: 0, isCostPlus: true },
        claimedCents: 0,
        amountCents: 100_000,
      }),
    ).toMatchObject({ ok: false, reason: 'nothingLogged' });
  });

  it('still refuses claiming more than a cost-plus job has come to', () => {
    expect(
      checkClaim({
        value: { totalCents: 300_000, isCostPlus: true },
        claimedCents: 250_000,
        amountCents: 100_000,
      }),
    ).toMatchObject({ ok: false, reason: 'overClaim', remainingCents: 50_000 });
  });
});
