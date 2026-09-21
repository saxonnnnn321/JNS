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
