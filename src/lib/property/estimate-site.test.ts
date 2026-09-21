import { describe, expect, it } from 'vitest';
import { estimateSite } from './estimate-site';
import { SITE_MODEL } from './site-model';

const typicalBlock = {
  parcelAreaM2: 650,
  parcelPerimeterM: 108,
  buildingAreaM2: 190,
  buildingCount: 2,
  addressExact: true,
};

describe('estimateSite', () => {
  it('splits a typical block into lawn, paving and beds', () => {
    const { measurements } = estimateSite(typicalBlock);

    // 650 - 190 house - 78 paving = 382 soft, 85/15 lawn to beds.
    expect(measurements.hardSurfaceM2).toBe(78);
    expect(measurements.lawnAreaM2).toBe(325);

    const { estimatedBedAreaM2 } = estimateSite(typicalBlock);
    expect(estimatedBedAreaM2).toBe(57);

    const total =
      measurements.lawnAreaM2 + estimatedBedAreaM2 + measurements.hardSurfaceM2 + 190;
    expect(total).toBeCloseTo(650, 0);
  });

  it('never quotes weeding off a plan, because a plan cannot see beds', () => {
    const { measurements, estimatedBedAreaM2, basis } = estimateSite(typicalBlock);
    expect(measurements.weedAreaM2).toBe(0);
    // But the beds still come off the lawn, so the mowing figure is right.
    expect(estimatedBedAreaM2).toBeGreaterThan(0);
    expect(basis.join(' ')).toContain('Weeding is left at zero');
  });

  it('is more confident with a real footprint than an assumed one', () => {
    const measured = estimateSite(typicalBlock);
    const assumed = estimateSite({ ...typicalBlock, buildingAreaM2: null });

    expect(measured.confidence).toBe(SITE_MODEL.confidence.measuredFootprint);
    expect(assumed.confidence).toBe(SITE_MODEL.confidence.assumedFootprint);
    expect(assumed.warnings.join(' ')).toContain('assumed');
    // Assuming 32% coverage on a 650 m2 block means 208 m2 of house, more than
    // this block's real 190 m2 — so the assumption is the conservative one and
    // leaves less lawn. Worth knowing which way the fallback errs.
    expect(assumed.measurements.lawnAreaM2).toBeLessThan(
      measured.measurements.lawnAreaM2,
    );
  });

  it('flags a block that is not ordinary suburban housing', () => {
    const acreage = estimateSite({ ...typicalBlock, parcelAreaM2: 17000, parcelPerimeterM: 560 });
    expect(acreage.warnings.join(' ')).toContain('not a standard suburban block');
    expect(acreage.confidence).toBeLessThan(typicalBlock.buildingAreaM2 ? 0.72 : 1);
  });

  it('caps a footprint that swallows the block, and says so', () => {
    const units = estimateSite({ ...typicalBlock, buildingAreaM2: 600 });
    expect(units.warnings.join(' ')).toContain('units or a townhouse');
    expect(units.measurements.lawnAreaM2).toBeGreaterThanOrEqual(0);
  });

  it('drops confidence when the address was a fuzzy match', () => {
    const exact = estimateSite(typicalBlock);
    const fuzzy = estimateSite({ ...typicalBlock, addressExact: false });
    expect(fuzzy.confidence).toBeLessThan(exact.confidence);
    expect(fuzzy.warnings.join(' ')).toContain('right house');
  });

  it('never returns a negative area', () => {
    const tiny = estimateSite({
      parcelAreaM2: 60,
      parcelPerimeterM: 32,
      buildingAreaM2: 200,
      addressExact: true,
    });
    for (const value of Object.values(tiny.measurements)) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});
