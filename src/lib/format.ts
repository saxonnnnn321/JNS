import { RATE_CARD } from './rate-card';

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(cents / 100);
}

export function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatQuantity(quantity: number, unit: string | null): string {
  if (unit === null) return String(quantity);
  const pretty = unit === 'm2' ? 'm²' : unit === 'm3' ? 'm³' : unit;
  return `${Math.round(quantity * 10) / 10} ${pretty}`;
}

/**
 * Human label for a site condition, pulled from the rate card so the PDF and the
 * form never drift apart from the thing that actually does the pricing.
 */
export function conditionLabel(
  family: 'grassHeight' | 'obstacleDensity' | 'slope' | 'access',
  value: string,
): string {
  const table = RATE_CARD.multipliers[family] as Record<
    string,
    { label: string; factor: number }
  >;
  return table[value]?.label ?? value;
}
