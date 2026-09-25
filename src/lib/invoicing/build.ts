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

/** A construction job or similar one-off, finished and not yet billed. */
export type InvoiceableJob = {
  jobId: string;
  title: string;
  propertyLabel?: string;
  /** YYYY-MM-DD */
  completedOn: string;
  priceCents: number;
  materialsCents: number;
  /**
   * True when stages of this job have already been billed, so this line is
   * only what is left rather than the whole price.
   */
  isBalance?: boolean;
};

/** A stage of a big job, billed before the job is finished. */
export type InvoiceableClaim = {
  claimId: string;
  jobTitle: string;
  propertyLabel?: string;
  description: string;
  amountCents: number;
  /** YYYY-MM-DD */
  claimedOn: string;
};

/** Anything else: materials, a callout, or a discount (negative). */
export type InvoiceableExtra = {
  extraId: string;
  description: string;
  amountCents: number;
  /** YYYY-MM-DD */
  incurredOn: string;
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
  /** What this invoice covers, to be stamped with its id afterwards. */
  visitIds: string[];
  jobIds: string[];
  claimIds: string[];
  extraIds: string[];
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
  jobs = [],
  claims = [],
  extras = [],
  gstRegistered,
  gstRate,
}: {
  visits: InvoiceableVisit[];
  /** Construction and other one-off work, finished and unbilled. */
  jobs?: InvoiceableJob[];
  /** Stages of a job in progress. */
  claims?: InvoiceableClaim[];
  /** Materials, callouts, discounts. */
  extras?: InvoiceableExtra[];
  gstRegistered: boolean;
  gstRate: number;
}): BuiltInvoice {
  if (
    visits.length === 0 &&
    jobs.length === 0 &&
    claims.length === 0 &&
    extras.length === 0
  ) {
    return {
      lines: [],
      subtotalCents: 0,
      gstCents: 0,
      totalCents: 0,
      visitIds: [],
      jobIds: [],
      claimIds: [],
      extraIds: [],
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

  const visitLines = [...groups.values()]
    // Earliest work first, which is the order it was done in.
    .sort((a, b) => [...a.dates].sort()[0].localeCompare([...b.dates].sort()[0]))
    .map((group) => ({
      description: `${group.propertyLabel} — ${
        PACKAGE_LABEL[group.packageKey] ?? group.packageKey
      } (${datesLabel(group.dates)})`,
      quantity: group.dates.length,
      unit: group.dates.length === 1 ? 'visit' : 'visits',
      amountCents: group.priceCents * group.dates.length,
    }));

  // A one-off job is its own line — never grouped, because two retaining
  // walls at the same price are still two different walls.
  const jobLines = [...jobs]
    .sort((a, b) => a.completedOn.localeCompare(b.completedOn))
    .flatMap((job) => {
      const where = job.propertyLabel ? `${job.propertyLabel} — ` : '';
      const line = {
        description: `${where}${job.title}${
          job.isBalance ? ' — balance' : ''
        } (completed ${short(job.completedOn)})`,
        quantity: 1,
        unit: 'job',
        amountCents: job.priceCents,
      };
      // Materials are shown separately so the customer can see the split.
      return job.materialsCents > 0
        ? [
            line,
            {
              description: `${where}${job.title} — materials`,
              quantity: 1,
              unit: '',
              amountCents: job.materialsCents,
            },
          ]
        : [line];
    });

  // Progress claims read as their own stage, so the customer can follow the
  // job across several invoices.
  const claimLines = [...claims]
    .sort((a, b) => a.claimedOn.localeCompare(b.claimedOn))
    .map((claim) => {
      const where = claim.propertyLabel ? `${claim.propertyLabel} — ` : '';
      return {
        description: `${where}${claim.jobTitle}: ${claim.description} (${short(
          claim.claimedOn,
        )})`,
        quantity: 1,
        unit: 'progress claim',
        amountCents: claim.amountCents,
      };
    });

  const extraLines = [...extras]
    .sort((a, b) => a.incurredOn.localeCompare(b.incurredOn))
    .map((extra) => ({
      description: `${extra.description} (${short(extra.incurredOn)})`,
      quantity: 1,
      unit: '',
      amountCents: extra.amountCents,
    }));

  const lines: InvoiceLine[] = [
    ...visitLines,
    ...claimLines,
    ...jobLines,
    ...extraLines,
  ].map((line, index) => ({ ...line, sort: index }));

  const subtotalCents = lines.reduce((total, line) => total + line.amountCents, 0);
  // A discount big enough to go negative should not produce negative tax.
  const gstCents =
    gstRegistered && subtotalCents > 0 ? Math.round(subtotalCents * gstRate) : 0;

  const allDates = [
    ...visits.map((visit) => visit.date),
    ...jobs.map((job) => job.completedOn),
    ...claims.map((claim) => claim.claimedOn),
    ...extras.map((extra) => extra.incurredOn),
  ].sort();

  return {
    lines,
    subtotalCents,
    gstCents,
    totalCents: subtotalCents + gstCents,
    visitIds: visits.map((visit) => visit.visitId),
    jobIds: jobs.map((job) => job.jobId),
    claimIds: claims.map((claim) => claim.claimId),
    extraIds: extras.map((extra) => extra.extraId),
    periodFrom: allDates[0],
    periodTo: allDates[allDates.length - 1],
    isEmpty: false,
  };
}
