/**
 * The pricing engine.
 *
 * Pure, deterministic, no I/O. Same inputs always produce the same price, which
 * is what makes a quote defensible when a customer queries it.
 *
 * DESIGN RULE: the AI never produces a dollar figure. In step 3 the photo
 * assessment fills in `SiteConditions` (which bucket the lawn falls into) and
 * step 2 fills in `SiteMeasurements` (how big it is). This file turns those into
 * money using the rate card, and nothing else does.
 */

import { RATE_CARD, type TaskKey } from './rate-card';
import { BUSINESS } from './business';
import { addDays, businessDate } from './dates';
import type {
  LineItem,
  PackageKey,
  QuoteEstimate,
  QuoteOption,
  QuoteRequest,
  SiteConditions,
  SiteMeasurements,
} from './types';

interface PackageDefinition {
  name: string;
  tasks: TaskKey[];
  includesGreenWaste: boolean;
}

/**
 * The blurb is BUILT FROM THE LINE ITEMS, never written by hand.
 *
 * A fixed description promising "beds weeded and hedges trimmed" appeared on a
 * test quote where both were zero — the customer would have been entitled to
 * both. Describing only what is actually priced keeps the document honest as
 * measurements change.
 */
function describe(items: LineItem[], includesGreenWaste: boolean): string {
  const work = items
    .filter(
      (item) => !['setup', 'travel', 'extra', 'greenWaste'].includes(item.task),
    )
    .map((item) => item.description.toLowerCase());

  if (work.length === 0) return 'Nothing priced yet.';

  const listed =
    work.length === 1
      ? work[0]
      : `${work.slice(0, -1).join(', ')} and ${work[work.length - 1]}`;

  const hasWaste = items.some((item) => item.task === 'greenWaste');
  const tail = includesGreenWaste
    ? hasWaste
      ? ', with all green waste taken away'
      : ', with green waste taken away if there is any'
    : '';

  return `${listed.charAt(0).toUpperCase()}${listed.slice(1)}${tail}.`;
}

/** The "give me a couple of options" presets. Add more freely. */
export const PACKAGES: Record<PackageKey, PackageDefinition> = {
  standard: {
    name: 'Standard cut',
    tasks: ['mow', 'edge', 'blow'],
    includesGreenWaste: false,
  },
  fullTidy: {
    name: 'Full tidy',
    tasks: ['mow', 'edge', 'blow', 'bedTidy', 'weed', 'hedge'],
    includesGreenWaste: true,
  },
};

/** Which measurement drives which task. */
const MEASUREMENT_FOR_TASK: Record<TaskKey, keyof SiteMeasurements> = {
  mow: 'lawnAreaM2',
  edge: 'edgeMetres',
  blow: 'hardSurfaceM2',
  bedTidy: 'bedEdgeMetres',
  hedge: 'hedgeMetres',
  weed: 'weedAreaM2',
};

function lookupFactor(
  family: 'grassHeight' | 'obstacleDensity' | 'slope' | 'access',
  conditions: SiteConditions,
): { name: string; factor: number } {
  const table = RATE_CARD.multipliers[family] as Record<
    string,
    { label: string; factor: number }
  >;
  const entry = table[conditions[family]];
  if (!entry) {
    throw new Error(`Unknown ${family} value: ${String(conditions[family])}`);
  }
  return { name: entry.label, factor: entry.factor };
}

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

function minutesToCents(minutes: number): number {
  return toCents((minutes / 60) * RATE_CARD.hourlyRate);
}

/** Round to the nearest `step` dollars, expressed in cents. */
function roundToStep(cents: number, stepDollars: number): number {
  const step = stepDollars * 100;
  return Math.round(cents / step) * step;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function priceOption(
  key: PackageKey,
  measurements: SiteMeasurements,
  conditions: SiteConditions,
  extras: QuoteRequest['extras'] = [],
  labourAdditions: QuoteRequest['labourAdditions'] = [],
): QuoteOption {
  const pkg = PACKAGES[key];
  const access = lookupFactor('access', conditions);
  const items: LineItem[] = [];

  for (const taskKey of pkg.tasks) {
    const task = RATE_CARD.tasks[taskKey];
    const quantity = measurements[MEASUREMENT_FOR_TASK[taskKey]] ?? 0;
    if (quantity <= 0) continue;

    const baseMinutes = (quantity / task.unitsPerHour) * 60;

    // Access applies to every task: the gear still has to get in and out.
    const appliedFactors = [
      ...task.affectedBy.map((family) => lookupFactor(family, conditions)),
      access,
    ];
    const minutes = appliedFactors.reduce(
      (acc, { factor }) => acc * factor,
      baseMinutes,
    );

    items.push({
      task: taskKey,
      description: task.label,
      quantity,
      unit: task.unit,
      minutes,
      amountCents: minutesToCents(minutes),
      appliedFactors,
    });
  }

  // Setup and pack-down, only if there is actually work to do.
  if (items.length > 0) {
    const setupMinutes = RATE_CARD.setupMinutes * access.factor;
    items.push({
      task: 'setup',
      description: 'Site setup & pack down',
      quantity: null,
      unit: null,
      minutes: setupMinutes,
      amountCents: minutesToCents(setupMinutes),
      appliedFactors: [access],
    });
  }

  // Green waste, where the package includes taking it away.
  if (pkg.includesGreenWaste && measurements.greenWasteM3 > 0) {
    const chargeable = Math.max(
      0,
      measurements.greenWasteM3 - RATE_CARD.greenWaste.freeAllowanceM3,
    );
    if (chargeable > 0) {
      items.push({
        task: 'greenWaste',
        description: RATE_CARD.greenWaste.label,
        quantity: chargeable,
        unit: 'm3',
        minutes: 0,
        amountCents: toCents(chargeable * RATE_CARD.greenWaste.perCubicMetre),
        appliedFactors: [],
      });
    }
  }

  // Travel beyond the included radius.
  const chargeableKm = Math.max(
    0,
    measurements.travelKm - RATE_CARD.travel.includedKm,
  );
  if (chargeableKm > 0) {
    items.push({
      task: 'travel',
      description: RATE_CARD.travel.label,
      quantity: chargeableKm,
      unit: 'km',
      minutes: 0,
      amountCents: toCents(chargeableKm * RATE_CARD.travel.perKm),
      appliedFactors: [],
    });
  }

  for (const addition of labourAdditions) {
    if (addition.minutes <= 0) continue;
    items.push({
      task: 'statedLabour',
      description: addition.description,
      quantity: null,
      unit: null,
      minutes: addition.minutes,
      amountCents: minutesToCents(addition.minutes),
      // No multipliers: a time the operator stated already accounts for them.
      appliedFactors: [],
    });
  }

  for (const extra of extras) {
    items.push({
      task: 'extra',
      description: extra.description,
      quantity: null,
      unit: null,
      minutes: 0,
      amountCents: toCents(extra.amount),
      appliedFactors: [],
    });
  }

  const totalMinutes = items.reduce((acc, item) => acc + item.minutes, 0);
  const calculatedCents = items.reduce((acc, item) => acc + item.amountCents, 0);

  // Minimum charge applies to the job as a whole, not per task.
  const minimumCents = toCents(RATE_CARD.minimumCharge);
  const minimumChargeApplied =
    calculatedCents > 0 && calculatedCents < minimumCents;
  const beforeRounding = minimumChargeApplied ? minimumCents : calculatedCents;

  const subtotalCents =
    beforeRounding > 0
      ? roundToStep(beforeRounding, RATE_CARD.roundSubtotalTo)
      : 0;
  const roundingCents = subtotalCents - beforeRounding;

  const gstCents = BUSINESS.gstRegistered
    ? Math.round(subtotalCents * BUSINESS.gstRate)
    : 0;
  const totalCents = subtotalCents + gstCents;

  // Less confidence in the assessment means a wider band on the quote.
  const { minBandPct, maxBandPct } = RATE_CARD.confidence;
  const confidence = clamp01(conditions.confidence);
  const bandPct = maxBandPct + (minBandPct - maxBandPct) * confidence;

  return {
    key,
    name: pkg.name,
    blurb: describe(items, pkg.includesGreenWaste),
    items,
    totalMinutes,
    subtotalCents,
    gstCents,
    totalCents,
    roundingCents,
    minimumChargeApplied,
    bandLowCents: roundToStep(Math.round(totalCents * (1 - bandPct)), 5),
    bandHighCents: roundToStep(Math.round(totalCents * (1 + bandPct)), 5),
  };
}

function quoteReference(issuedDate: string): string {
  const stamp = issuedDate.replace(/-/g, '');
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `Q-${stamp}-${suffix}`;
}

export function estimateQuote(
  request: QuoteRequest,
  now: Date = new Date(),
): QuoteEstimate {
  const packageKeys = request.packageKeys ?? ['standard', 'fullTidy'];
  const options = packageKeys.map((key) =>
    priceOption(
      key,
      request.measurements,
      request.conditions,
      request.extras,
      request.labourAdditions,
    ),
  );

  const issuedDate = businessDate(now);
  const validUntil = addDays(issuedDate, RATE_CARD.quoteValidDays);

  // A quoting tool that knows when to shut up is worth more than one that is
  // confidently wrong.
  const reasons: string[] = [];
  const confidence = clamp01(request.conditions.confidence);
  if (confidence < RATE_CARD.confidence.siteVisitBelowConfidence) {
    reasons.push(
      `Assessment confidence is ${Math.round(confidence * 100)}% — below the ${Math.round(
        RATE_CARD.confidence.siteVisitBelowConfidence * 100,
      )}% threshold for quoting off photos alone.`,
    );
  }
  const longest = Math.max(...options.map((option) => option.totalMinutes), 0);
  if (longest > RATE_CARD.confidence.siteVisitAboveMinutes) {
    reasons.push(
      `Estimated at over ${Math.round(
        RATE_CARD.confidence.siteVisitAboveMinutes / 60,
      )} hours on site — worth walking before committing to a price.`,
    );
  }

  return {
    reference: quoteReference(issuedDate),
    issuedAt: now.toISOString(),
    issuedDate,
    validUntil,
    customer: request.customer,
    property: request.property,
    measurements: request.measurements,
    conditions: request.conditions,
    options,
    notes: request.notes,
    gstRegistered: BUSINESS.gstRegistered,
    needsSiteVisit: reasons.length > 0,
    siteVisitReasons: reasons,
  };
}
