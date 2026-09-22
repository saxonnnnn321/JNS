import { describe, expect, it } from 'vitest';
import { estimateQuote } from './pricing';
import { RATE_CARD } from './rate-card';
import { BUSINESS } from './business';
import type { QuoteRequest, SiteConditions, SiteMeasurements } from './types';

const AT = new Date('2026-09-21T09:00:00+10:00');

const measurements: SiteMeasurements = {
  lawnAreaM2: 320,
  edgeMetres: 85,
  hardSurfaceM2: 120,
  bedEdgeMetres: 40,
  hedgeMetres: 12,
  weedAreaM2: 18,
  greenWasteM3: 0.8,
  travelKm: 10,
};

const conditions: SiteConditions = {
  grassHeight: 'normal',
  obstacleDensity: 'moderate',
  slope: 'flat',
  access: 'standardGate',
  confidence: 0.8,
};

function request(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    customer: { name: 'Test Customer' },
    property: {
      addressLine: '14 Wattle Street',
      suburb: 'Penrith',
      state: 'NSW',
      postcode: '2750',
    },
    measurements,
    conditions,
    ...overrides,
  };
}

describe('estimateQuote', () => {
  it('prices a standard suburban block off the seed rate card', () => {
    const quote = estimateQuote(request({ packageKeys: ['standard'] }), AT);
    const [standard] = quote.options;

    // 320 m2 mow + 85 m edge + 120 m2 blow down + setup, at $150/hr.
    expect(standard.totalMinutes).toBeCloseTo(88.04, 1);
    expect(standard.subtotalCents).toBe(22000);
    // GST follows whether the business is registered, which is a real setting
    // that changes when turnover crosses $75k. Pinning a number here would
    // make a correct config change look like a broken engine.
    const expectedGst = BUSINESS.gstRegistered ? 2200 : 0;
    expect(standard.gstCents).toBe(expectedGst);
    expect(standard.totalCents).toBe(22000 + expectedGst);
    expect(standard.minimumChargeApplied).toBe(false);
  });

  it('returns a couple of options by default, with full tidy dearer', () => {
    const quote = estimateQuote(request(), AT);
    expect(quote.options.map((option) => option.key)).toEqual([
      'standard',
      'fullTidy',
    ]);

    const [standard, fullTidy] = quote.options;
    expect(fullTidy.totalCents).toBeGreaterThan(standard.totalCents);
  });

  it('describes only the work it actually prices', () => {
    // No hedge run and no beds to weed, so the blurb must not promise either.
    const quote = estimateQuote(
      request({
        measurements: { ...measurements, hedgeMetres: 0, weedAreaM2: 0 },
      }),
      AT,
    );
    const blurb = quote.options[1].blurb.toLowerCase();
    expect(blurb).not.toContain('hedge');
    expect(blurb).not.toContain('weed');
    expect(blurb).toContain('mow lawn areas');
    expect(blurb).toContain('green waste');

    // And when there IS a hedge, it says so.
    const withHedge = estimateQuote(request(), AT).options[1];
    expect(withHedge.blurb.toLowerCase()).toContain('hedge');
  });

  it('charges time the operator stated, without applying the multipliers', () => {
    // "Weeding, about an hour" at $150/hr is $150 — not $150 x 1.06 for the
    // side gate. Saxon already accounted for the gate when he said an hour.
    const quote = estimateQuote(
      request({
        packageKeys: ['standard'],
        labourAdditions: [{ description: 'Weed garden beds', minutes: 60 }],
      }),
      AT,
    );
    const stated = quote.options[0].items.find((i) => i.task === 'statedLabour');
    expect(stated).toBeDefined();
    expect(stated!.minutes).toBe(60);
    expect(stated!.amountCents).toBe(15000);
    expect(stated!.appliedFactors).toEqual([]);
  });

  it('puts stated labour into the total and the blurb', () => {
    const without = estimateQuote(request({ packageKeys: ['standard'] }), AT);
    const with_ = estimateQuote(
      request({
        packageKeys: ['standard'],
        labourAdditions: [{ description: 'Weed garden beds', minutes: 60 }],
      }),
      AT,
    );
    // An hour at the $150 rate, plus GST only if the business charges it.
    const anHour = 15000;
    expect(with_.options[0].totalCents - without.options[0].totalCents).toBe(
      BUSINESS.gstRegistered ? Math.round(anHour * 1.1) : anHour,
    );
    // The subtotal is the part that must never move with a tax setting.
    expect(
      with_.options[0].subtotalCents - without.options[0].subtotalCents,
    ).toBe(anHour);
    expect(with_.options[0].blurb.toLowerCase()).toContain('weed garden beds');
  });

  it('ignores a stated time of zero', () => {
    const quote = estimateQuote(
      request({
        packageKeys: ['standard'],
        labourAdditions: [{ description: 'Nothing', minutes: 0 }],
      }),
      AT,
    );
    expect(quote.options[0].items.some((i) => i.task === 'statedLabour')).toBe(false);
  });

  it('only charges green waste on the package that includes removal', () => {
    const quote = estimateQuote(request(), AT);
    const [standard, fullTidy] = quote.options;

    expect(standard.items.some((item) => item.task === 'greenWaste')).toBe(false);

    const waste = fullTidy.items.find((item) => item.task === 'greenWaste');
    expect(waste).toBeDefined();
    // 0.8 m3 less the 0.2 m3 allowance, at $45/m3.
    expect(waste!.amountCents).toBe(2700);
  });

  it('keeps line items reconciled with the subtotal', () => {
    const quote = estimateQuote(request(), AT);
    for (const option of quote.options) {
      const sum = option.items.reduce((acc, item) => acc + item.amountCents, 0);
      expect(sum + option.roundingCents).toBe(option.subtotalCents);
      expect(Math.abs(option.roundingCents)).toBeLessThanOrEqual(
        (RATE_CARD.roundSubtotalTo * 100) / 2,
      );
    }
  });

  it('applies the minimum charge to a small courtyard', () => {
    const quote = estimateQuote(
      request({
        packageKeys: ['standard'],
        measurements: { ...measurements, lawnAreaM2: 25, edgeMetres: 10, hardSurfaceM2: 0 },
      }),
      AT,
    );
    const [standard] = quote.options;

    expect(standard.minimumChargeApplied).toBe(true);
    expect(standard.subtotalCents).toBe(RATE_CARD.minimumCharge * 100);
  });

  it('charges more for an overgrown lawn than a maintained one', () => {
    const maintained = estimateQuote(
      request({ packageKeys: ['standard'] }),
      AT,
    ).options[0];
    const overgrown = estimateQuote(
      request({
        packageKeys: ['standard'],
        conditions: { ...conditions, grassHeight: 'overgrown' },
      }),
      AT,
    ).options[0];

    expect(overgrown.totalCents).toBeGreaterThan(maintained.totalCents);
    // 1.6x on the mowing and edging, not on setup — so well short of 1.6x overall.
    expect(overgrown.totalCents / maintained.totalCents).toBeGreaterThan(1.3);
    expect(overgrown.totalCents / maintained.totalCents).toBeLessThan(1.6);
  });

  it('widens the band and flags a site visit when confidence is low', () => {
    const confident = estimateQuote(request({ packageKeys: ['standard'] }), AT);
    const unsure = estimateQuote(
      request({
        packageKeys: ['standard'],
        conditions: { ...conditions, confidence: 0.35 },
      }),
      AT,
    );

    expect(confident.needsSiteVisit).toBe(false);
    expect(unsure.needsSiteVisit).toBe(true);
    expect(unsure.siteVisitReasons[0]).toContain('confidence');

    const spread = (o: { bandHighCents: number; bandLowCents: number }) =>
      o.bandHighCents - o.bandLowCents;
    expect(spread(unsure.options[0])).toBeGreaterThan(
      spread(confident.options[0]),
    );
  });

  it('brackets the quoted total inside the band', () => {
    const quote = estimateQuote(request(), AT);
    for (const option of quote.options) {
      expect(option.bandLowCents).toBeLessThanOrEqual(option.totalCents);
      expect(option.bandHighCents).toBeGreaterThanOrEqual(option.totalCents);
    }
  });

  it('only charges travel past the included radius', () => {
    const near = estimateQuote(request({ packageKeys: ['standard'] }), AT);
    expect(near.options[0].items.some((i) => i.task === 'travel')).toBe(false);

    const far = estimateQuote(
      request({
        packageKeys: ['standard'],
        measurements: { ...measurements, travelKm: 45 },
      }),
      AT,
    );
    const travel = far.options[0].items.find((i) => i.task === 'travel');
    expect(travel).toBeDefined();
    // 25 km past the included 20, at $1.10/km.
    expect(travel!.amountCents).toBe(2750);
  });

  it('charges GST at 10% only while registered', () => {
    const quote = estimateQuote(request(), AT);
    for (const option of quote.options) {
      const expected = BUSINESS.gstRegistered
        ? Math.round(option.subtotalCents * 0.1)
        : 0;
      expect(option.gstCents).toBe(expected);
      expect(option.totalCents).toBe(option.subtotalCents + option.gstCents);
    }
  });

  it('quotes nothing when there is nothing to measure', () => {
    const quote = estimateQuote(
      request({
        packageKeys: ['standard'],
        measurements: {
          lawnAreaM2: 0,
          edgeMetres: 0,
          hardSurfaceM2: 0,
          bedEdgeMetres: 0,
          hedgeMetres: 0,
          weedAreaM2: 0,
          greenWasteM3: 0,
          travelKm: 0,
        },
      }),
      AT,
    );
    expect(quote.options[0].items).toHaveLength(0);
    expect(quote.options[0].subtotalCents).toBe(0);
  });

  it('sets a 30 day validity window', () => {
    const quote = estimateQuote(request(), AT);
    expect(quote.issuedDate).toBe('2026-09-21');
    expect(quote.validUntil).toBe('2026-10-21');
  });
});

describe('the API schema and the engine agree', () => {
  it('passes every quote input through validation intact', async () => {
    const { quoteRequestSchema } = await import('./schema');
    const input = request({
      packageKeys: ['standard'],
      labourAdditions: [{ description: 'Weed garden beds', minutes: 60 }],
      extras: [{ description: 'Dump run', amount: 40 }],
      notes: 'Gate code 1234',
    });

    const parsed = quoteRequestSchema.parse(input);

    // A field the engine honours but the schema drops is money quietly lost.
    expect(parsed.labourAdditions).toEqual(input.labourAdditions);
    expect(parsed.extras).toEqual(input.extras);
    expect(parsed.notes).toBe(input.notes);
    expect(estimateQuote(parsed, AT).options[0].totalCents).toBe(
      estimateQuote(input, AT).options[0].totalCents,
    );
  });
});
