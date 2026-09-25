/**
 * The invoice PDF.
 *
 * The word at the top is load-bearing. An Australian document may only be
 * called a "Tax invoice" if the business is registered for GST; if it is not,
 * it is an "Invoice" with no GST line anywhere. BUSINESS.gstRegistered
 * decides both, so there is one place to get it right.
 *
 * The ABN is not decoration either — without one, a customer is legally
 * required to withhold 47% of the payment.
 */

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { BUSINESS, hasBankDetails } from '../business';
import { formatBusinessDate } from '../dates';
import { formatMoney } from '../format';

const INK = '#1a1a1a';
const MUTED = '#6b6b6b';
const RULE = '#d8d8d8';
const ACCENT = '#2f5d3a';

const styles = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 44,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: INK,
    lineHeight: 1.45,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  business: { width: '55%' },
  businessName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: ACCENT,
    lineHeight: 1.25,
    marginBottom: 2,
  },
  docMeta: { width: '40%', textAlign: 'right' },
  docTitle: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1.5,
    lineHeight: 1.2,
    marginBottom: 2,
  },
  muted: { color: MUTED },
  label: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: MUTED,
    letterSpacing: 1,
    marginBottom: 1.5,
  },
  parties: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  party: { width: '48%' },
  row: { flexDirection: 'row', paddingVertical: 4 },
  headRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingBottom: 3,
  },
  bodyRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: RULE,
    paddingVertical: 5,
  },
  cDesc: { width: '64%', paddingRight: 8 },
  cQty: { width: '12%', textAlign: 'right' },
  cAmount: { width: '24%', textAlign: 'right' },
  totals: { marginTop: 10, alignSelf: 'flex-end', width: '45%' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: INK,
    marginTop: 4,
    paddingTop: 5,
  },
  grandText: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: ACCENT },
  pay: {
    marginTop: 18,
    borderWidth: 0.5,
    borderColor: RULE,
    padding: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 7.5,
    color: MUTED,
  },
});

export type InvoiceDocumentData = {
  reference: string;
  issuedDate: string;
  dueDate: string;
  customer: { name: string; email?: string; phone?: string };
  lines: { description: string; quantity: number; unit: string; amountCents: number }[];
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
};

export function InvoiceDocument({ invoice }: { invoice: InvoiceDocumentData }) {
  const gst = BUSINESS.gstRegistered;
  // Only worth printing if there is a street or suburb behind it. A lone
  // "NSW" under the business name looks like something went wrong.
  const hasAddress =
    BUSINESS.address.addressLine.trim() !== '' ||
    BUSINESS.address.suburb.trim() !== '';
  const address = hasAddress
    ? [
        BUSINESS.address.addressLine,
        BUSINESS.address.suburb,
        BUSINESS.address.state,
        BUSINESS.address.postcode,
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  return (
    <Document
      title={`${invoice.reference} — ${BUSINESS.tradingName}`}
      author={BUSINESS.legalName}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.business}>
            <Text style={styles.businessName}>{BUSINESS.tradingName}</Text>
            <Text style={styles.muted}>ABN {BUSINESS.abn}</Text>
            {address !== '' && <Text style={styles.muted}>{address}</Text>}
            <Text style={styles.muted}>
              {BUSINESS.phone} · {BUSINESS.email}
            </Text>
          </View>
          <View style={styles.docMeta}>
            {/* Only a GST-registered business may head a document this way. */}
            <Text style={styles.docTitle}>{gst ? 'TAX INVOICE' : 'INVOICE'}</Text>
            <Text>{invoice.reference}</Text>
            <Text style={styles.muted}>
              Issued {formatBusinessDate(invoice.issuedDate)}
            </Text>
            <Text style={styles.muted}>
              Due {formatBusinessDate(invoice.dueDate)}
            </Text>
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.label}>BILL TO</Text>
            <Text>{invoice.customer.name}</Text>
            {invoice.customer.email && (
              <Text style={styles.muted}>{invoice.customer.email}</Text>
            )}
            {invoice.customer.phone && (
              <Text style={styles.muted}>{invoice.customer.phone}</Text>
            )}
          </View>
        </View>

        <View style={styles.headRow}>
          <Text style={[styles.cDesc, styles.label]}>WORK DONE</Text>
          <Text style={[styles.cQty, styles.label]}>QTY</Text>
          <Text style={[styles.cAmount, styles.label]}>AMOUNT</Text>
        </View>

        {invoice.lines.map((line, index) => (
          <View key={index} style={styles.bodyRow}>
            <Text style={styles.cDesc}>{line.description}</Text>
            <Text style={styles.cQty}>
              {line.quantity} {line.unit}
            </Text>
            <Text style={styles.cAmount}>{formatMoney(line.amountCents)}</Text>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.muted}>{gst ? 'Subtotal (ex GST)' : 'Subtotal'}</Text>
            <Text>{formatMoney(invoice.subtotalCents)}</Text>
          </View>
          {gst && (
            <View style={styles.totalRow}>
              <Text style={styles.muted}>GST 10%</Text>
              <Text>{formatMoney(invoice.gstCents)}</Text>
            </View>
          )}
          <View style={styles.grand}>
            <Text style={styles.grandText}>Total due</Text>
            <Text style={styles.grandText}>{formatMoney(invoice.totalCents)}</Text>
          </View>
        </View>

        {/* Just the account, nothing else. No payment-terms line, no
            reference line, and no note about GST — the document already says
            "Invoice" rather than "Tax invoice" and shows no GST amount,
            which is all the law actually asks of a business that is not
            registered. The whole block disappears until there is an account
            to pay into, rather than printing an apology. */}
        {hasBankDetails && (
          <View style={styles.pay}>
            <Text style={styles.label}>HOW TO PAY</Text>
            <Text>
              {BUSINESS.payment.accountName} · BSB {BUSINESS.payment.bsb} ·
              Account {BUSINESS.payment.accountNumber}
            </Text>
          </View>
        )}

        <Text style={styles.footer} fixed>
          {BUSINESS.tradingName} · ABN {BUSINESS.abn} · {BUSINESS.phone}
        </Text>
      </Page>
    </Document>
  );
}
