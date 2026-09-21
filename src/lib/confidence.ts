/**
 * There are two independent ways a quote can be wrong, and they multiply.
 *
 *   measurement confidence — do we know how big the job is?
 *                            (cadastre = good, assumed house size = less good)
 *   condition confidence   — do we know how bad the job is?
 *                            (photos = good, guessing = poor)
 *
 * A perfectly measured block with completely unknown grass height is not a
 * confident quote, and neither is a great photo of a block we could not find a
 * boundary for. Treating them as independent and multiplying says exactly that.
 *
 * The practical effect: before any photos are added, combined confidence lands
 * below the site-visit threshold, so the quote tells the customer it is
 * indicative. That is correct — a plan alone cannot tell you what a lawn looks
 * like today.
 */

/** Confidence in the conditions when nobody has looked at the place yet. */
export const UNSEEN_CONDITION_CONFIDENCE = 0.45;

export function combineConfidence(
  measurement: number,
  condition: number,
): number {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return Math.round(clamp(measurement) * clamp(condition) * 100) / 100;
}
