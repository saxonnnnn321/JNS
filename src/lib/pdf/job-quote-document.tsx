/**
 * The quote for a one-off job.
 *
 * Deliberately not the lawn quote. That one shows options, measurements and
 * a confidence band, because it was worked out from a rate card and the
 * customer deserves to see the reasoning. A construction quote is the
 * opposite: a scope of works and a number you stand behind.
 *
 * The scope is free text and prints as written, so a list typed with dashes
 * comes out as a list.
 */

import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { BUSINESS } from '../business';
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
  party: { marginBottom: 14 },
  jobTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
    lineHeight: 1.3,
  },
  scope: { marginBottom: 12 },
  scopeLine: { marginBottom: 2 },
  totals: { marginTop: 6, alignSelf: 'flex-end', width: '45%' },
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
  terms: { marginTop: 18, borderTopWidth: 0.5, borderTopColor: RULE, paddingTop: 10 },
  term: { marginBottom: 3, color: MUTED },
  accept: {
    marginTop: 16,
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

export type JobQuoteData = {
  reference: string;
  issuedDate: string;
  validUntil: string;
  customer: { name: string; email?: string; phone?: string };
  propertyLabel?: string;
  title: string;
  scope?: string;
  /** Cost-plus quotes describe a rate rather than name a figure. */
  isCostPlus: boolean;
  labourRateCents: number;
  markupBasisPoints: number;
  priceCents: number;
  materialsCents: number;
  gstCents: number;
  totalCents: number;
};

export function JobQuoteDocument({ quote }: { quote: JobQuoteData }) {
  const gst = BUSINESS.gstRegistered;
  // Free text, printed as written — a dashed list stays a dashed list.
  const scopeLines = (quote.scope ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  return (
    <Document
      title={`${quote.reference} — ${quote.title}`}
      author={BUSINESS.legalName}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.business}>
            <Text style={styles.businessName}>{BUSINESS.tradingName}</Text>
            <Text style={styles.muted}>ABN {BUSINESS.abn}</Text>
            <Text style={styles.muted}>
              {BUSINESS.phone} · {BUSINESS.email}
            </Text>
          </View>
          <View style={styles.docMeta}>
            <Text style={styles.docTitle}>QUOTE</Text>
            <Text>{quote.reference}</Text>
            <Text style={styles.muted}>
              {formatBusinessDate(quote.issuedDate)}
            </Text>
            <Text style={styles.muted}>
              Valid until {formatBusinessDate(quote.validUntil)}
            </Text>
          </View>
        </View>

        <View style={styles.party}>
          <Text style={styles.label}>PREPARED FOR</Text>
          <Text>{quote.customer.name}</Text>
          {quote.propertyLabel && (
            <Text style={styles.muted}>{quote.propertyLabel}</Text>
          )}
        </View>

        <Text style={styles.label}>THE WORK</Text>
        <Text style={styles.jobTitle}>{quote.title}</Text>

        {scopeLines.length > 0 && (
          <View style={styles.scope}>
            {scopeLines.map((line, index) => (
              <Text key={index} style={styles.scopeLine}>
                {line}
              </Text>
            ))}
          </View>
        )}

        {quote.isCostPlus ? (
          /* No total to give: the price is a rate, and the job is worth
             whatever it takes. Saying otherwise would be inventing a
             number nobody agreed to. */
          <View style={styles.accept}>
            <Text style={styles.label}>HOW IT IS CHARGED</Text>
            <Text>
              Labour at {formatMoney(quote.labourRateCents)} per hour, plus
              materials at cost
              {quote.markupBasisPoints > 0
                ? ` plus ${quote.markupBasisPoints / 100}%`
                : ''}
              .
            </Text>
            <Text style={styles.muted}>
              Charged on the hours actually worked and the materials actually
              used. Receipts available on request.
            </Text>
          </View>
        ) : (
          <View style={styles.totals}>
            {quote.materialsCents > 0 && (
              <>
                <View style={styles.totalRow}>
                  <Text style={styles.muted}>Labour</Text>
                  <Text>{formatMoney(quote.priceCents)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.muted}>Materials</Text>
                  <Text>{formatMoney(quote.materialsCents)}</Text>
                </View>
              </>
            )}
            {gst && (
              <View style={styles.totalRow}>
                <Text style={styles.muted}>GST 10%</Text>
                <Text>{formatMoney(quote.gstCents)}</Text>
              </View>
            )}
            <View style={styles.grand}>
              <Text style={styles.grandText}>Total</Text>
              <Text style={styles.grandText}>{formatMoney(quote.totalCents)}</Text>
            </View>
          </View>
        )}

        <View style={styles.terms}>
          <Text style={styles.label}>TERMS</Text>
          {BUSINESS.jobTerms.map((term, index) => (
            <Text key={index} style={styles.term}>
              · {term}
            </Text>
          ))}
        </View>

        <View style={styles.accept}>
          <Text>
            Happy with this? Reply to {BUSINESS.email} or ring{' '}
            {BUSINESS.phone} and we will get you booked in.
          </Text>
        </View>

        <Text style={styles.footer} fixed>
          {BUSINESS.tradingName} · ABN {BUSINESS.abn} · {BUSINESS.phone}
        </Text>
      </Page>
    </Document>
  );
}
