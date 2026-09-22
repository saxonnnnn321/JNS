import { describe, expect, it } from 'vitest';
import { invoiceBody, invoiceSubject } from './compose';
import { BUSINESS, hasBankDetails } from '../business';

const input = {
  reference: 'INV-0007',
  customerName: 'Dave Thompson',
  totalCents: 103_600,
  dueDate: '2026-09-29',
  gstRegistered: BUSINESS.gstRegistered,
};

describe('invoiceSubject', () => {
  it('names the business and the invoice', () => {
    const subject = invoiceSubject(input);
    expect(subject).toContain(BUSINESS.tradingName);
    expect(subject).toContain('INV-0007');
  });

  it('only says "Tax invoice" when registered for GST', () => {
    expect(invoiceSubject({ ...input, gstRegistered: true })).toContain(
      'Tax invoice',
    );
    const unregistered = invoiceSubject({ ...input, gstRegistered: false });
    expect(unregistered).toContain('Invoice');
    expect(unregistered).not.toContain('Tax invoice');
  });
});

describe('invoiceBody', () => {
  it('greets the customer and states the amount and due date', () => {
    const body = invoiceBody(input);
    expect(body).toContain('Hi Dave Thompson,');
    expect(body).toContain('$1,036.00');
    expect(body).toContain('29 September 2026');
    expect(body).toContain('INV-0007');
  });

  it('asks them to call when there is no account to pay into', () => {
    // Guards the same rule the PDF follows: never imply a payable account
    // that does not exist. Tracks the real config, so it starts asserting the
    // bank-details branch the moment the account is added.
    const body = invoiceBody(input);
    if (hasBankDetails) {
      expect(body).toContain(BUSINESS.payment.bsb);
      expect(body).toContain('Reference INV-0007');
    } else {
      expect(body).toContain(BUSINESS.phone);
      expect(body).not.toMatch(/BSB\s*\S/);
    }
  });

  it('signs off as the business', () => {
    expect(invoiceBody(input)).toContain(BUSINESS.tradingName);
  });
});
