import { describe, expect, it } from 'vitest';
import { SiteAssessmentError, assessSite } from './site';

describe('assessSite', () => {
  it('needs either a photo or a note', async () => {
    await expect(assessSite([], '   ')).rejects.toBeInstanceOf(SiteAssessmentError);
  });

  it('accepts a note with no photos', async () => {
    // Gets past the input guard and fails on the missing key instead.
    const previous = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(assessSite([], 'this one is overgrown')).rejects.toThrow(
        /ANTHROPIC_API_KEY/,
      );
    } finally {
      if (previous !== undefined) process.env.ANTHROPIC_API_KEY = previous;
    }
  });
});
