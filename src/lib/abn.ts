/**
 * Australian Business Number validation.
 *
 * An ABN carries a checksum, so a mistyped one can be caught before it goes
 * out on an invoice. That matters more than it sounds: a customer who cannot
 * match the ABN on your invoice to the register is legally required to
 * withhold 47% of the payment.
 *
 * The algorithm is the ATO's published one — subtract 1 from the first digit,
 * apply the fixed weights, and the total must divide by 89.
 */

const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

/** Digits only, so "79 123 765 026" and "79123765026" are the same thing. */
export function normaliseAbn(abn: string): string {
  return abn.replace(/\D/g, '');
}

export function isValidAbn(abn: string): boolean {
  const digits = normaliseAbn(abn);
  if (digits.length !== 11) return false;
  // An ABN never starts with zero, and the all-zero placeholder must fail.
  if (digits[0] === '0') return false;

  const numbers = [...digits].map(Number);
  numbers[0] -= 1;

  const total = numbers.reduce(
    (sum, value, index) => sum + value * WEIGHTS[index],
    0,
  );
  return total % 89 === 0;
}

/** The way the ATO prints it: 79 123 765 026. */
export function formatAbn(abn: string): string {
  const digits = normaliseAbn(abn);
  if (digits.length !== 11) return abn;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
}
