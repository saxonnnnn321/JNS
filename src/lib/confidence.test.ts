import { describe, expect, it } from 'vitest';
import { RATE_CARD } from './rate-card';
import { UNSEEN_CONDITION_CONFIDENCE, combineConfidence } from './confidence';

describe('combineConfidence', () => {
  it('multiplies the two sources', () => {
    expect(combineConfidence(0.72, 0.85)).toBe(0.61);
    expect(combineConfidence(1, 1)).toBe(1);
  });

  it('clamps nonsense inputs', () => {
    expect(combineConfidence(2, 0.5)).toBe(0.5);
    expect(combineConfidence(-1, 0.9)).toBe(0);
  });

  it('keeps a photo-less quote below the site-visit threshold', () => {
    // Even the best possible measurement, with nobody having seen the place.
    const best = combineConfidence(0.72, UNSEEN_CONDITION_CONFIDENCE);
    expect(best).toBeLessThan(RATE_CARD.confidence.siteVisitBelowConfidence);
  });

  it('lets a well-photographed, well-measured job clear the threshold', () => {
    expect(combineConfidence(0.72, 0.88)).toBeGreaterThan(
      RATE_CARD.confidence.siteVisitBelowConfidence,
    );
  });
});
