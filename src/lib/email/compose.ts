import { BUSINESS, hasBankDetails } from '../business';
import { formatBusinessDate } from '../dates';
import { formatMoney } from '../format';

/**
 * What the invoice email actually says.
 *
 * Pure, so the wording can be tested without sending anything. The payment
 * paragraph changes with whether there is an account to pay into — an email
 * that says "pay this into nothing" is worse than one that asks them to call.
 */

export type InvoiceEmailInput = {
  reference: string;
  customerName: string;
  totalCents: number;
  dueDate: string;
  gstRegistered: boolean;
};

export function invoiceSubject(input: InvoiceEmailInput): string {
  const kind = input.gstRegistered ? 'Tax invoice' : 'Invoice';
  return `${BUSINESS.tradingName} — ${kind} ${input.reference}`;
}

export function invoiceBody(input: InvoiceEmailInput): string {
  const payment = hasBankDetails
    ? [
        'Bank transfer:',
        `  ${BUSINESS.payment.accountName}`,
        `  BSB ${BUSINESS.payment.bsb}`,
        `  Account ${BUSINESS.payment.accountNumber}`,
        `  Reference ${input.reference}`,
      ].join('\n')
    : `Please give me a call on ${BUSINESS.phone} to arrange payment.`;

  return [
    `Hi ${input.customerName},`,
    '',
    `Thanks for your business. ${input.reference} is attached — ${formatMoney(
      input.totalCents,
    )}, due ${formatBusinessDate(input.dueDate)}.`,
    '',
    payment,
    '',
    'Any questions, just reply to this email or give me a ring.',
    '',
    'Thanks,',
    BUSINESS.tradingName,
    BUSINESS.phone,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export type QuoteEmailInput = {
  reference: string;
  customerName: string;
  title: string;
  totalCents: number;
  validUntil: string;
  isCostPlus: boolean;
  labourRateCents: number;
};

export function quoteSubject(input: QuoteEmailInput): string {
  return `${BUSINESS.tradingName} — quote for ${input.title}`;
}

export function quoteBody(input: QuoteEmailInput): string {
  // A cost-plus quote has no total to name, and inventing one would be a
  // number nobody agreed to.
  const price = input.isCostPlus
    ? `It is charged at ${formatMoney(input.labourRateCents)} an hour plus materials, so the final figure depends on how it runs. The attached quote sets out the work.`
    : `The total is ${formatMoney(input.totalCents)}, and the quote is attached.`;

  return [
    `Hi ${input.customerName},`,
    '',
    `Thanks for having me out. Here is the quote for ${input.title}.`,
    '',
    price,
    '',
    `It holds until ${formatBusinessDate(input.validUntil)}.`,
    '',
    'Any questions, or if you want something changed, just reply or give me a ring.',
    '',
    'Thanks,',
    BUSINESS.tradingName,
    BUSINESS.phone,
  ].join('\n');
}
