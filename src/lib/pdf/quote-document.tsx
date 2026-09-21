/**
 * The quote PDF. Rendered server-side by @react-pdf/renderer — no headless
 * browser, so it runs fine on Vercel.
 *
 * Deliberately shows more than one option, plus a price band and a "we should
 * look at this first" state. A single bare number is the least useful thing you
 * can put in front of a customer.
 */

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import { BUSINESS } from '../business';
import { formatBusinessDate } from '../dates';
import {
  conditionLabel,
  formatMinutes,
  formatMoney,
  formatQuantity,
} from '../format';
import type { QuoteEstimate, QuoteOption } from '../types';

const INK = '#1a1a1a';
const MUTED = '#6b6b6b';
const RULE = '#d8d8d8';
const ACCENT = '#2f5d3a';
const WARN = '#8a5a00';

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
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
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
  parties: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  party: { width: '48%' },
  label: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: MUTED,
    letterSpacing: 1,
    marginBottom: 1.5,
  },
  banner: {
    borderWidth: 1,
    borderColor: WARN,
    borderStyle: 'solid',
    padding: 9,
    marginBottom: 18,
  },
  bannerTitle: { fontFamily: 'Helvetica-Bold', color: WARN, marginBottom: 3 },
  siteBox: {
    backgroundColor: '#f4f5f3',
    padding: 7,
    marginBottom: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  siteCell: { width: '25%', marginBottom: 1 },
  option: { marginBottom: 9, borderWidth: 1, borderColor: RULE, borderStyle: 'solid' },
  optionHead: {
    backgroundColor: ACCENT,
    paddingVertical: 6,
    paddingHorizontal: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  optionName: {
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    fontSize: 11,
    lineHeight: 1.3,
  },
  optionPrice: {
    fontFamily: 'Helvetica-Bold',
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 1.3,
  },
  optionBody: { paddingHorizontal: 9, paddingTop: 5, paddingBottom: 6 },
  blurb: { color: MUTED, marginBottom: 4 },
  row: { flexDirection: 'row', paddingVertical: 1.4 },
  rowRule: { borderTopWidth: 0.5, borderTopColor: RULE, borderTopStyle: 'solid' },
  cDesc: { width: '50%' },
  cQty: { width: '20%', textAlign: 'right' },
  cTime: { width: '15%', textAlign: 'right', color: MUTED },
  cAmt: { width: '15%', textAlign: 'right' },
  bold: { fontFamily: 'Helvetica-Bold' },
  totals: { marginTop: 5, alignItems: 'flex-end' },
  totalRow: { flexDirection: 'row', width: 200, justifyContent: 'space-between' },
  grandRow: {
    flexDirection: 'row',
    width: 200,
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: INK,
    borderTopStyle: 'solid',
    marginTop: 3,
    paddingTop: 3,
  },
  band: { marginTop: 4, fontSize: 8, color: MUTED },
  terms: { marginTop: 6 },
  term: { flexDirection: 'row', marginBottom: 3 },
  bullet: { width: 10 },
  footer: {
    position: 'absolute',
    bottom: 22,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: RULE,
    borderTopStyle: 'solid',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: MUTED,
  },
});

function OptionBlock({
  option,
  gstRegistered,
}: {
  option: QuoteOption;
  gstRegistered: boolean;
}) {
  return (
    <View style={styles.option} wrap={false}>
      <View style={styles.optionHead}>
        <Text style={styles.optionName}>{option.name}</Text>
        <Text style={styles.optionPrice}>
          {formatMoney(option.totalCents)}
          {gstRegistered ? ' inc GST' : ''}
        </Text>
      </View>

      <View style={styles.optionBody}>
        <Text style={styles.blurb}>{option.blurb}</Text>

        <View style={[styles.row, styles.rowRule]}>
          <Text style={[styles.cDesc, styles.label]}>WORK</Text>
          <Text style={[styles.cQty, styles.label]}>QTY</Text>
          <Text style={[styles.cTime, styles.label]}>TIME</Text>
          <Text style={[styles.cAmt, styles.label]}>AMOUNT</Text>
        </View>

        {option.items.map((item, index) => (
          <View key={index} style={[styles.row, styles.rowRule]}>
            <Text style={styles.cDesc}>{item.description}</Text>
            <Text style={styles.cQty}>
              {item.quantity === null ? '—' : formatQuantity(item.quantity, item.unit)}
            </Text>
            <Text style={styles.cTime}>
              {item.minutes > 0 ? formatMinutes(item.minutes) : '—'}
            </Text>
            <Text style={styles.cAmt}>{formatMoney(item.amountCents)}</Text>
          </View>
        ))}

        {option.minimumChargeApplied && (
          <View style={[styles.row, styles.rowRule]}>
            <Text style={[styles.cDesc, styles.muted]}>
              Minimum job charge applied
            </Text>
            <Text style={styles.cQty}> </Text>
            <Text style={styles.cTime}> </Text>
            <Text style={styles.cAmt}> </Text>
          </View>
        )}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.muted}>Subtotal (ex GST)</Text>
            <Text>{formatMoney(option.subtotalCents)}</Text>
          </View>
          {gstRegistered && (
            <View style={styles.totalRow}>
              <Text style={styles.muted}>GST 10%</Text>
              <Text>{formatMoney(option.gstCents)}</Text>
            </View>
          )}
          <View style={styles.grandRow}>
            <Text style={styles.bold}>Total</Text>
            <Text style={styles.bold}>{formatMoney(option.totalCents)}</Text>
          </View>
        </View>

        <Text style={styles.band}>
          Estimated {formatMinutes(option.totalMinutes)} on site. Expected range{' '}
          {formatMoney(option.bandLowCents)} – {formatMoney(option.bandHighCents)}{' '}
          depending on what we find on the day.
        </Text>
      </View>
    </View>
  );
}

export function QuoteDocument({ quote }: { quote: QuoteEstimate }) {
  const { property, customer, measurements, conditions } = quote;

  return (
    <Document
      title={`Quote ${quote.reference} — ${BUSINESS.tradingName}`}
      author={BUSINESS.tradingName}
      subject={`Landscaping quote for ${property.addressLine}`}
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
            <Text style={styles.muted}>{quote.reference}</Text>
            <Text style={styles.muted}>
              Issued {formatBusinessDate(quote.issuedDate)}
            </Text>
            <Text style={styles.muted}>
              Valid until {formatBusinessDate(quote.validUntil)}
            </Text>
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.party}>
            <Text style={styles.label}>PREPARED FOR</Text>
            <Text style={styles.bold}>{customer.name}</Text>
            {customer.phone ? <Text style={styles.muted}>{customer.phone}</Text> : null}
            {customer.email ? <Text style={styles.muted}>{customer.email}</Text> : null}
          </View>
          <View style={styles.party}>
            <Text style={styles.label}>PROPERTY</Text>
            <Text>{property.addressLine}</Text>
            <Text>
              {property.suburb} {property.state} {property.postcode}
            </Text>
          </View>
        </View>

        {quote.needsSiteVisit && (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>
              Indicative only — we would like to see the site first
            </Text>
            {quote.siteVisitReasons.map((reason, index) => (
              <Text key={index} style={styles.muted}>
                · {reason}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.siteBox}>
          <View style={styles.siteCell}>
            <Text style={styles.label}>LAWN</Text>
            <Text>{Math.round(measurements.lawnAreaM2)} m²</Text>
          </View>
          <View style={styles.siteCell}>
            <Text style={styles.label}>EDGES</Text>
            <Text>{Math.round(measurements.edgeMetres)} m</Text>
          </View>
          <View style={styles.siteCell}>
            <Text style={styles.label}>GRASS</Text>
            <Text>{conditionLabel('grassHeight', conditions.grassHeight)}</Text>
          </View>
          <View style={styles.siteCell}>
            <Text style={styles.label}>OBSTACLES</Text>
            <Text>{conditionLabel('obstacleDensity', conditions.obstacleDensity)}</Text>
          </View>
          <View style={styles.siteCell}>
            <Text style={styles.label}>SLOPE</Text>
            <Text>{conditionLabel('slope', conditions.slope)}</Text>
          </View>
          <View style={styles.siteCell}>
            <Text style={styles.label}>ACCESS</Text>
            <Text>{conditionLabel('access', conditions.access)}</Text>
          </View>
          <View style={styles.siteCell}>
            <Text style={styles.label}>HARD SURFACE</Text>
            <Text>{Math.round(measurements.hardSurfaceM2)} m²</Text>
          </View>
          <View style={styles.siteCell}>
            <Text style={styles.label}>CONFIDENCE</Text>
            <Text>{Math.round(conditions.confidence * 100)}%</Text>
          </View>
        </View>

        {quote.options.map((option) => (
          <OptionBlock
            key={option.key}
            option={option}
            gstRegistered={quote.gstRegistered}
          />
        ))}

        {quote.notes ? (
          <View style={styles.terms}>
            <Text style={styles.label}>NOTES</Text>
            <Text>{quote.notes}</Text>
          </View>
        ) : null}

        <View style={styles.terms}>
          <Text style={styles.label}>TERMS</Text>
          {BUSINESS.quoteTerms.map((term, index) => (
            <View key={index} style={styles.term}>
              <Text style={styles.bullet}>·</Text>
              <Text style={{ flex: 1 }}>{term}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {BUSINESS.tradingName} · ABN {BUSINESS.abn}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
