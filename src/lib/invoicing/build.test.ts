import { describe, expect, it } from 'vitest';
import {
  buildInvoice,
  formatInvoiceReference,
  type InvoiceableExtra,
  type InvoiceableJob,
  type InvoiceableVisit,
} from './build';

const visit = (over: Partial<InvoiceableVisit> = {}): InvoiceableVisit => ({
  visitId: 'v1',
  date: '2026-09-07',
  planId: 's1',
  priceCents: 30_800,
  packageKey: 'standard',
  propertyLabel: '5 Hope Street, Penrith',
  ...over,
});

describe('buildInvoice', () => {
  it('bills a single visit at the price the customer agreed to', () => {
    const invoice = buildInvoice({
      visits: [visit()],
      gstRegistered: false,
      gstRate: 0.1,
    });
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.subtotalCents).toBe(30_800);
    expect(invoice.totalCents).toBe(30_800);
    expect(invoice.lines[0].description).toMatch(/5 Hope Street, Penrith/);
  });

  it('collapses repeat visits to one place into a single line', () => {
    const invoice = buildInvoice({
      visits: [
        visit({ visitId: 'v1', date: '2026-09-07' }),
        visit({ visitId: 'v2', date: '2026-09-21' }),
      ],
      gstRegistered: false,
      gstRate: 0.1,
    });
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.lines[0].quantity).toBe(2);
    expect(invoice.lines[0].unit).toBe('visits');
    expect(invoice.lines[0].amountCents).toBe(61_600);
    expect(invoice.lines[0].description).toMatch(/7 Sep, 21 Sep/);
  });

  it('keeps different properties on separate lines', () => {
    const invoice = buildInvoice({
      visits: [
        visit({ visitId: 'v1', propertyLabel: '5 Hope Street, Penrith' }),
        visit({
          visitId: 'v2',
          propertyLabel: '2/18 Derby Street, Penrith',
          priceCents: 15_000,
          date: '2026-09-08',
        }),
      ],
      gstRegistered: false,
      gstRate: 0.1,
    });
    expect(invoice.lines).toHaveLength(2);
    expect(invoice.subtotalCents).toBe(45_800);
  });

  it('summarises rather than listing when there are many visits', () => {
    const invoice = buildInvoice({
      visits: ['01', '08', '15', '22', '29'].map((day, i) =>
        visit({ visitId: `v${i}`, date: `2026-09-${day}` }),
      ),
      gstRegistered: false,
      gstRate: 0.1,
    });
    expect(invoice.lines[0].description).toMatch(/5 visits, 1 Sep to 29 Sep/);
  });

  it('adds no GST when the business is not registered', () => {
    const invoice = buildInvoice({
      visits: [visit()],
      gstRegistered: false,
      gstRate: 0.1,
    });
    expect(invoice.gstCents).toBe(0);
    expect(invoice.totalCents).toBe(invoice.subtotalCents);
  });

  it('adds GST once registered, without touching the agreed prices', () => {
    const invoice = buildInvoice({
      visits: [visit()],
      gstRegistered: true,
      gstRate: 0.1,
    });
    expect(invoice.subtotalCents).toBe(30_800);
    expect(invoice.gstCents).toBe(3_080);
    expect(invoice.totalCents).toBe(33_880);
  });

  it('rounds GST to the cent', () => {
    const invoice = buildInvoice({
      visits: [visit({ priceCents: 30_805 })],
      gstRegistered: true,
      gstRate: 0.1,
    });
    expect(invoice.gstCents).toBe(3_081); // 3080.5 rounds up
    expect(invoice.subtotalCents + invoice.gstCents).toBe(invoice.totalCents);
  });

  it('reports the period it actually covers', () => {
    const invoice = buildInvoice({
      visits: [
        visit({ visitId: 'v1', date: '2026-09-21' }),
        visit({ visitId: 'v2', date: '2026-09-07' }),
      ],
      gstRegistered: false,
      gstRate: 0.1,
    });
    expect(invoice.periodFrom).toBe('2026-09-07');
    expect(invoice.periodTo).toBe('2026-09-21');
  });

  it('carries every visit id so none can be billed twice', () => {
    const invoice = buildInvoice({
      visits: [visit({ visitId: 'a' }), visit({ visitId: 'b', date: '2026-09-21' })],
      gstRegistered: false,
      gstRate: 0.1,
    });
    expect(invoice.visitIds.sort()).toEqual(['a', 'b']);
  });

  it('says plainly when there is nothing to bill', () => {
    const invoice = buildInvoice({ visits: [], gstRegistered: false, gstRate: 0.1 });
    expect(invoice.isEmpty).toBe(true);
    expect(invoice.totalCents).toBe(0);
    expect(invoice.lines).toEqual([]);
  });
});

describe('formatInvoiceReference', () => {
  it('pads so invoices sort properly', () => {
    expect(formatInvoiceReference(1)).toBe('INV-0001');
    expect(formatInvoiceReference(42)).toBe('INV-0042');
    expect(formatInvoiceReference(1234)).toBe('INV-1234');
  });

  it('never produces a zeroth invoice', () => {
    expect(formatInvoiceReference(0)).toBe('INV-0001');
  });
});

const job = (over: Partial<InvoiceableJob> = {}): InvoiceableJob => ({
  jobId: 'j1',
  title: 'Retaining wall, back yard',
  propertyLabel: '12 Short Street, Emu Plains',
  completedOn: '2026-09-18',
  priceCents: 420_000,
  materialsCents: 0,
  ...over,
});

describe('buildInvoice — construction and one-off work', () => {
  it('bills a job with no mowing visits at all', () => {
    // The case that was impossible before: a customer who has never been on
    // the round still needs an invoice.
    const invoice = buildInvoice({
      visits: [],
      jobs: [job()],
      gstRegistered: false,
      gstRate: 0.1,
    });
    expect(invoice.isEmpty).toBe(false);
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.totalCents).toBe(420_000);
    expect(invoice.lines[0].description).toMatch(/Retaining wall/);
    expect(invoice.jobIds).toEqual(['j1']);
  });

  it('splits materials onto their own line so the customer sees it', () => {
    const invoice = buildInvoice({
      visits: [],
      jobs: [job({ materialsCents: 138_000 })],
      gstRegistered: false,
      gstRate: 0.1,
    });
    expect(invoice.lines).toHaveLength(2);
    expect(invoice.lines[1].description).toMatch(/materials/);
    expect(invoice.totalCents).toBe(558_000);
  });

  it('never groups two jobs, even at the same price', () => {
    // Two walls at $4,200 are two walls, not "2 x wall".
    const invoice = buildInvoice({
      visits: [],
      jobs: [
        job({ jobId: 'a', title: 'Front wall' }),
        job({ jobId: 'b', title: 'Back wall', completedOn: '2026-09-19' }),
      ],
      gstRegistered: false,
      gstRate: 0.1,
    });
    expect(invoice.lines).toHaveLength(2);
  });

  it('puts mowing and construction on the one invoice', () => {
    const invoice = buildInvoice({
      visits: [visit()],
      jobs: [job()],
      gstRegistered: false,
      gstRate: 0.1,
    });
    expect(invoice.lines).toHaveLength(2);
    expect(invoice.totalCents).toBe(30_800 + 420_000);
    expect(invoice.visitIds).toEqual(['v1']);
    expect(invoice.jobIds).toEqual(['j1']);
  });
});

describe('buildInvoice — extra lines', () => {
  const extra = (over: Partial<InvoiceableExtra> = {}): InvoiceableExtra => ({
    extraId: 'e1',
    description: 'Turf, 40 rolls',
    amountCents: 52_000,
    incurredOn: '2026-09-15',
    ...over,
  });

  it('adds materials bought for a customer', () => {
    const invoice = buildInvoice({
      visits: [visit()],
      extras: [extra()],
      gstRegistered: false,
      gstRate: 0.1,
    });
    expect(invoice.totalCents).toBe(30_800 + 52_000);
    expect(invoice.extraIds).toEqual(['e1']);
  });

  it('takes a discount off, because a negative extra is how you give one', () => {
    const invoice = buildInvoice({
      visits: [visit()],
      extras: [extra({ description: 'Pensioner discount', amountCents: -5_000 })],
      gstRegistered: false,
      gstRate: 0.1,
    });
    expect(invoice.totalCents).toBe(25_800);
  });

  it('charges no tax on a credit', () => {
    // A discount larger than the work would otherwise produce negative GST,
    // which is not a thing you may put on an invoice.
    const invoice = buildInvoice({
      visits: [],
      extras: [extra({ description: 'Refund', amountCents: -10_000 })],
      gstRegistered: true,
      gstRate: 0.1,
    });
    expect(invoice.gstCents).toBe(0);
    expect(invoice.totalCents).toBe(-10_000);
  });
});
