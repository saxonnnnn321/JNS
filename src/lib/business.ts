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

  /** TODO: your ABN. Required on tax invoices. */
  abn: '00 000 000 000',

  /** TODO */
  phone: '0400 000 000',
  email: 'hello@example.com.au',

  address: {
    addressLine: '',
    suburb: '',
    state: 'NSW',
    postcode: '',
  },

  /**
   * Set to false if you are NOT registered for GST (turnover under $75k).
   *
   * This matters: if you are not registered you must NOT charge GST, and the
   * document is an "Invoice", not a "Tax invoice". The engine and the PDF both
   * respect this flag, so get it right once here.
   */
  gstRegistered: true,
  gstRate: 0.1,

  /** Where the money goes. Shown on invoices. */
  payment: {
    bankName: '',
    accountName: 'JNS Landscaping',
    bsb: '000-000',
    accountNumber: '00000000',
    termsDays: 7,
  },

  quoteTerms: [
    'Prices are an estimate based on the information and photos supplied. If the site differs materially from what was quoted we will contact you before starting.',
    'Green waste removal is charged per cubic metre where it is not included in the package above.',
    'Access to water, power and a side gate is assumed unless noted.',
    'This quote is valid for 30 days from the date of issue.',
  ],
} as const;
