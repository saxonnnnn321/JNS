import { describe, expect, it } from 'vitest';
import { estimateQuote } from './pricing';
import { UNSEEN_CONDITION_CONFIDENCE, combineConfidence } from './confidence';
import { estimateSite } from './property/estimate-site';
import type { QuoteRequest } from './types';

/**
 * The address-to-quote journey, end to end but offline.
 *
 * Uses the real cadastral figures for 5 Hope Street Penrith (Lot 19//DP31239,
 * 621 m2, 111 m boundary, 117 m2 house traced in OSM) so the numbers here are
 * the ones the live services actually return.
 */
const HOPE_STREET = estimateSite({
  parcelAreaM2: 621,
  parcelPerimeterM: 111,
  buildingAreaM2: 117,
  buildingCount: 1,
  addressExact: true,
});

function quoteFor(conditionConfidence: number, grassHeight: 'normal' | 'long') {
  const request: QuoteRequest = {
    customer: { name: 'Dave Thompson' },
    property: {
      addressLine: '5 Hope Street',
      suburb: 'Penrith',
      state: 'NSW',
      postcode: '2750',
    },
    measurements: HOPE_STREET.measurements,
    conditions: {
      grassHeight,
      obstacleDensity: 'moderate',
      slope: 'flat',
      access: 'standardGate',
      confidence: combineConfidence(HOPE_STREET.confidence, conditionConfidence),
    },
  };
  return estimateQuote(request, new Date('2026-09-21T09:00:00+10:00'));
}

describe('address to quote', () => {
  it('produces a priced quote from the plan alone', () => {
    const quote = quoteFor(UNSEEN_CONDITION_CONFIDENCE, 'normal');
    expect(HOPE_STREET.measurements.lawnAreaM2).toBeGreaterThan(300);
    expect(quote.options[0].totalCents).toBeGreaterThan(0);
  });

  it('marks a quote indicative until somebody has looked at the place', () => {
    const noPhotos = quoteFor(UNSEEN_CONDITION_CONFIDENCE, 'normal');
    expect(noPhotos.needsSiteVisit).toBe(true);
    expect(noPhotos.siteVisitReasons.join(' ')).toContain('confidence');
  });

  it('lets good photos turn it into a firm quote', () => {
    const withPhotos = quoteFor(0.88, 'normal');
    expect(withPhotos.needsSiteVisit).toBe(false);
  });

  it('narrows the price band once the photos are in', () => {
    const spread = (c: number) => {
      const [option] = quoteFor(c, 'normal').options;
      return option.bandHighCents - option.bandLowCents;
    };
    expect(spread(0.88)).toBeLessThan(spread(UNSEEN_CONDITION_CONFIDENCE));
  });

  it('changes the price when the photos show long grass', () => {
    const normal = quoteFor(0.88, 'normal').options[0].totalCents;
    const long = quoteFor(0.88, 'long').options[0].totalCents;
    expect(long).toBeGreaterThan(normal);
  });
});
