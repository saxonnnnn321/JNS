/**
 * Your business details, as they appear on quotes and tax invoices.
 *
 * FILL THESE IN before sending anything to a customer. The ABN and the exact
 * words "Tax invoice" are legal requirements on an Australian tax invoice — see
 * the note on gstRegistered below.
 */
export const BUSINESS = {
  tradingName: 'JNS Landscaping',
  legalName: 'JNS Landscaping',

  /**
   * Checked against the ATO checksum by lib/abn.ts, which has a test proving
   * this exact number is valid. Without a real ABN on an invoice a customer
   * is legally required to withhold 47% of the payment.
   */
  abn: '79 123 765 026',

  /** The number customers ring. Saxon's second line is 0468 566 820. */
  phone: '0491 973 965',
  email: 'jnslandscapes1@gmail.com',

  address: {
    addressLine: '',
    suburb: '',
    state: 'NSW',
    postcode: '',
  },

  /**
   * FALSE, because JNS is not registered for GST yet.
   *
   * Under $75k turnover you are not required to register, and if you are not
   * registered you must NOT charge GST — the document is an "Invoice", not a
   * "Tax invoice", and there is no 10% line. Charging GST you are not
   * registered to collect is the kind of mistake that is expensive to unwind.
   *
   * WHEN YOU REGISTER: flip this one word to `true`. The engine and the PDF
   * both read it, so quotes and invoices start showing GST from that moment —
   * nothing else needs changing. You must register within 21 days of your
   * rolling 12-month turnover reaching $75,000.
   */
  gstRegistered: false,
  gstRate: 0.1,

  /**
   * Where the money goes. Shown on invoices.
   *
   * EMPTY ON PURPOSE — the business account is still being opened. Empty is
   * safer than a placeholder: the invoice notices and prints "bank details
   * to follow" rather than a row of zeros a customer might actually try to
   * pay into. Fill bsb and accountNumber in and it starts printing them.
   */
  payment: {
    bankName: '',
    accountName: 'JNS Landscaping',
    bsb: '',
    accountNumber: '',
    termsDays: 7,
  },

  quoteTerms: [
    'Prices are an estimate based on the information and photos supplied. If the site differs materially from what was quoted we will contact you before starting.',
    'Green waste removal is charged per cubic metre where it is not included in the package above.',
    'Access to water, power and a side gate is assumed unless noted.',
    'This quote is valid for 30 days from the date of issue.',
  ],
} as const;

/** True once a customer could actually pay the invoice. */
export const hasBankDetails =
  BUSINESS.payment.bsb.trim() !== '' && BUSINESS.payment.accountNumber.trim() !== '';
