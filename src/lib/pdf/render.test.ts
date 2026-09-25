import { describe, expect, it } from 'vitest';
import { renderQuotePdf } from './render-quote';
import { estimateQuote } from '../pricing';
import type { QuoteRequest } from '../types';

const request: QuoteRequest = {
  customer: { name: 'Dave Thompson', phone: '0412 345 678', email: 'dave@example.com' },
  property: {
    addressLine: '14 Wattle Street',
    suburb: 'Penrith',
    state: 'NSW',
    postcode: '2750',
  },
  measurements: {
    lawnAreaM2: 320,
    edgeMetres: 85,
    hardSurfaceM2: 120,
    bedEdgeMetres: 40,
    hedgeMetres: 12,
    weedAreaM2: 18,
    greenWasteM3: 0.8,
    travelKm: 10,
  },
  conditions: {
    grassHeight: 'long',
    obstacleDensity: 'moderate',
    slope: 'flat',
    access: 'standardGate',
    confidence: 0.78,
  },
  notes: 'Back gate is padlocked — code supplied on booking.',
};

describe('QuoteDocument', () => {
  it('renders a real PDF', async () => {
    const quote = estimateQuote(request, new Date('2026-09-21T09:00:00+10:00'));
    const buffer = await renderQuotePdf(quote);

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(2000);

    const out = process.env.PDF_OUT;
    if (out) {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(out, buffer);
    }
  }, 30_000);
});

describe('renderInvoicePdf', () => {
  it('renders a real PDF', async () => {
    const { renderInvoicePdf } = await import('./render-invoice');
    const pdf = await renderInvoicePdf({
      reference: 'INV-0001',
      issuedDate: '2026-09-22',
      dueDate: '2026-09-29',
      customer: { name: 'Dave Thompson', email: 'dave@example.com' },
      lines: [
        {
          description: '5 Hope Street, Penrith — Mow, edge and blow down (7 Sep, 21 Sep)',
          quantity: 2,
          unit: 'visits',
          amountCents: 61_600,
        },
      ],
      subtotalCents: 61_600,
      gstCents: 0,
      totalCents: 61_600,
    });
    // %PDF- is the file signature. If @react-pdf throws, this never runs.
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});

describe('renderJobQuotePdf', () => {
  const base = {
    reference: 'Q-0001',
    issuedDate: '2026-09-25',
    validUntil: '2026-10-25',
    customer: { name: 'Marg Whitton' },
    propertyLabel: '12 Short Street, Emu Plains',
    title: 'Retaining wall, back yard',
    scope: 'Line one\nLine two',
    labourRateCents: 15_000,
    markupBasisPoints: 1500,
  };

  it('renders a fixed-price construction quote', async () => {
    const { renderJobQuotePdf } = await import('./render-job-quote');
    const pdf = await renderJobQuotePdf({
      ...base,
      isCostPlus: false,
      priceCents: 640_000,
      materialsCents: 312_000,
      gstCents: 0,
      totalCents: 952_000,
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('renders a cost-plus quote, which has no total to show', async () => {
    const { renderJobQuotePdf } = await import('./render-job-quote');
    const pdf = await renderJobQuotePdf({
      ...base,
      isCostPlus: true,
      priceCents: 0,
      materialsCents: 0,
      gstCents: 0,
      totalCents: 0,
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('copes with no scope written at all', async () => {
    const { renderJobQuotePdf } = await import('./render-job-quote');
    const pdf = await renderJobQuotePdf({
      ...base,
      scope: undefined,
      isCostPlus: false,
      priceCents: 100_000,
      materialsCents: 0,
      gstCents: 0,
      totalCents: 100_000,
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
