/**
 * Dates, in the timezone the business actually operates in.
 *
 * Do not reach for `toISOString().slice(0, 10)` anywhere in this project. A quote
 * written at 9am in Sydney is 11pm the previous day in UTC, so that trick puts
 * the wrong date on the document and expires quotes a day early. Quote dates are
 * calendar dates in NSW, so they are stored and compared as 'YYYY-MM-DD'.
 */

export const BUSINESS_TIMEZONE = 'Australia/Sydney';

/** The calendar date in NSW at a given instant, as 'YYYY-MM-DD'. */
export function businessDate(instant: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/** Calendar arithmetic on a 'YYYY-MM-DD' string, free of timezone drift. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** Render a 'YYYY-MM-DD' calendar date for an Australian reader. */
export function formatBusinessDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
