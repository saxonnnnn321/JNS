import type { PackageKey } from '../types';

/**
 * Turning finished work into an invoice.
 *
 * The input is visits that have been ticked off and not yet billed. Nothing
 * here guesses: a visit's price comes from the standing plan it belongs to,
 * which is the figure the customer already agreed to. The only arithmetic is
 * adding up and, if you are registered for it, GST.
 *
 * Repeat visits to the same place collapse into one line with a quantity,
 * because "4 visits at $154" reads better on an invoice than the same address
 * printed four times.
 *
 * Money is CENTS. Pure — no database, no dates from the system clock.
 */

const PACKAGE_LABEL: Record<PackageKey, string> = {
  standard: 'Mow, edge and blow down',
  fullTidy: 'Full tidy — mow, edge, beds and hedges',
};

export type InvoiceableVisit = {
  visitId: string;
  /** YYYY-MM-DD */
  date: string;
  planId: string;
  priceCents: number;
  packageKey: PackageKey;
  /** "5 Hope Street, Penrith" */
  propertyLabel: string;
};

export type InvoiceLine = {
  sort: number;
  description: string;
  quantity: number;
  unit: string;
  amountCents: number;
};

export type BuiltInvoice = {
  lines: InvoiceLine[];
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  /** The visits this invoice covers, to be stamped with its id afterwards. */
  visitIds: string[];
  periodFrom: string;
  periodTo: string;
  /** True when there was nothing to bill. */
  isEmpty: boolean;
};

/** INV-0001. Zero padded so they sort properly in a folder. */
export function formatInvoiceReference(sequence: number): string {
  return `INV-${String(Math.max(1, Math.floor(sequence))).padStart(4, '0')}`;
}

/** A short, readable list of dates for a grouped line. */
function datesLabel(dates: string[]): string {
  const sorted = [...dates].sort();
  if (sorted.length === 0) return '';
  if (sorted.length > 4) {
    return `${sorted.length} visits, ${short(sorted[0])} to ${short(sorted[sorted.length - 1])}`;
  }
  return sorted.map(short).join(', ');
}

/** 7 Sep — enough to recognise the visit without bloating the line. */
function short(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${day} ${months[month - 1] ?? ''}`.trim();
}

export function buildInvoice({
  visits,
  gstRegistered,
  gstRate,
}: {
  visits: InvoiceableVisit[];
  gstRegistered: boolean;
  gstRate: number;
}): BuiltInvoice {
  if (visits.length === 0) {
    return {
      lines: [],
      subtotalCents: 0,
      gstCents: 0,
      totalCents: 0,
      visitIds: [],
      periodFrom: '',
      periodTo: '',
      isEmpty: true,
    };
  }

  // Same place, same package, same price — one line with a quantity.
  const groups = new Map<
    string,
    {
      propertyLabel: string;
      packageKey: PackageKey;
      priceCents: number;
      dates: string[];
      visitIds: string[];
    }
  >();

  for (const visit of visits) {
    const key = `${visit.propertyLabel}|${visit.packageKey}|${visit.priceCents}`;
    const group = groups.get(key);
    if (group) {
      group.dates.push(visit.date);
      group.visitIds.push(visit.visitId);
    } else {
      groups.set(key, {
        propertyLabel: visit.propertyLabel,
        packageKey: visit.packageKey,
        priceCents: visit.priceCents,
        dates: [visit.date],
        visitIds: [visit.visitId],
      });
    }
  }

  const lines: InvoiceLine[] = [...groups.values()]
    // Earliest work first, which is the order it was done in.
    .sort((a, b) => [...a.dates].sort()[0].localeCompare([...b.dates].sort()[0]))
    .map((group, index) => ({
      sort: index,
      description: `${group.propertyLabel} — ${
        PACKAGE_LABEL[group.packageKey] ?? group.packageKey
      } (${datesLabel(group.dates)})`,
      quantity: group.dates.length,
      unit: group.dates.length === 1 ? 'visit' : 'visits',
      amountCents: group.priceCents * group.dates.length,
    }));

  const subtotalCents = lines.reduce((total, line) => total + line.amountCents, 0);
  const gstCents = gstRegistered ? Math.round(subtotalCents * gstRate) : 0;

  const allDates = visits.map((visit) => visit.date).sort();

  return {
    lines,
    subtotalCents,
    gstCents,
    totalCents: subtotalCents + gstCents,
    visitIds: visits.map((visit) => visit.visitId),
    periodFrom: allDates[0],
    periodTo: allDates[allDates.length - 1],
    isEmpty: false,
  };
}
