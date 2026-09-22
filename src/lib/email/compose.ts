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
