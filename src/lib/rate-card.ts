/**
 * THE RATE CARD — single source of truth for every price this system produces.
 *
 * Nothing else in the codebase contains a number that affects a quote. When a
 * quote feels wrong, you change it here, not in the AI prompt and not in the UI.
 *
 * The productivity figures are SEED VALUES — educated guesses, not measurements.
 * Log actual times on jobs and tune these in your first month. That is the whole
 * point of keeping them in one place.
 */

export const RATE_CARD = {
  /** Charge-out rate for labour, ex GST. */
  hourlyRate: 150,

  /**
   * Minimum charge for any job, ex GST. Set to one hour, the usual convention
   * for a $150/hr operation. Drop this to ~90 if you want to stay competitive on
   * small courtyard mows.
   */
  minimumCharge: 150,

  /** Quote subtotals are rounded to the nearest multiple of this, ex GST. */
  roundSubtotalTo: 5,

  /** Fixed on-site setup + pack-down, in minutes. Scaled by the access factor. */
  setupMinutes: 12,

  /** How long a quote stays valid. */
  quoteValidDays: 30,

  /**
   * Tasks: how fast you work, and which site conditions slow each one down.
   * `unitsPerHour` is EFFECTIVE throughput — including turns, trimming around
   * obstacles and emptying the catcher, not spec-sheet numbers.
   */
  tasks: {
    mow: {
      label: 'Mow lawn areas',
      unit: 'm2' as const,
      unitsPerHour: 600, // 21" push mower, suburban block with obstacles
      affectedBy: ['grassHeight', 'obstacleDensity', 'slope'] as const,
    },
    edge: {
      label: 'Edge & whipper snip',
      unit: 'm' as const,
      unitsPerHour: 180, // 3 lineal metres/min for a clean edge
      affectedBy: ['grassHeight', 'slope'] as const,
    },
    blow: {
      label: 'Blow down paths & driveway',
      unit: 'm2' as const,
      unitsPerHour: 2000,
      affectedBy: ['obstacleDensity'] as const,
    },
    bedTidy: {
      label: 'Garden bed edge & tidy',
      unit: 'm' as const,
      unitsPerHour: 60,
      affectedBy: [] as const,
    },
    hedge: {
      label: 'Hedge & shrub trim',
      unit: 'm' as const,
      unitsPerHour: 25,
      affectedBy: [] as const,
    },
    weed: {
      label: 'Weed garden beds',
      unit: 'm2' as const,
      unitsPerHour: 40,
      affectedBy: [] as const,
    },
  },

  /**
   * Condition multipliers. These are what the photo assessment feeds in step 3 —
   * the vision model picks the bucket, this table turns it into time.
   */
  multipliers: {
    grassHeight: {
      short: { label: 'Short / recently cut', factor: 0.9 },
      normal: { label: 'Normal (regular round)', factor: 1.0 },
      long: { label: 'Long — a few weeks growth', factor: 1.25 },
      overgrown: { label: 'Overgrown — knee high', factor: 1.6 },
      severe: { label: 'Severely overgrown / slashing', factor: 2.2 },
    },
    obstacleDensity: {
      none: { label: 'Clear open lawn', factor: 1.0 },
      low: { label: 'A few obstacles', factor: 1.08 },
      moderate: { label: 'Beds, trees, trampoline', factor: 1.2 },
      high: { label: 'Heavily cluttered', factor: 1.4 },
    },
    slope: {
      flat: { label: 'Flat', factor: 1.0 },
      gentle: { label: 'Gentle slope', factor: 1.1 },
      moderate: { label: 'Moderate slope', factor: 1.28 },
      steep: { label: 'Steep — safety concern', factor: 1.55 },
    },
    /** Applied to the whole job: gear has to get in and out. */
    access: {
      open: { label: 'Open / drive-on access', factor: 1.0 },
      standardGate: { label: 'Standard side gate', factor: 1.06 },
      narrowGate: { label: 'Narrow gate — barrow only', factor: 1.18 },
      stairsOnly: { label: 'Stairs / no vehicle access', factor: 1.4 },
    },
  },

  /** Green waste taken off site. */
  greenWaste: {
    freeAllowanceM3: 0.2,
    perCubicMetre: 45,
    label: 'Green waste removal & tip fees',
  },

  /** Travel. First `includedKm` from base is free. */
  travel: {
    includedKm: 20,
    perKm: 1.1,
    label: 'Travel beyond service area',
  },

  /**
   * Confidence → quote band. A low-confidence estimate gets a wider range and,
   * past the thresholds below, refuses to quote at all.
   */
  confidence: {
    minBandPct: 0.08, // at confidence 1.0
    maxBandPct: 0.3, // at confidence 0.0
    siteVisitBelowConfidence: 0.6,
    siteVisitAboveMinutes: 240,
  },
} as const;

export type RateCard = typeof RATE_CARD;
export type TaskKey = keyof RateCard['tasks'];
export type MultiplierFamily = keyof RateCard['multipliers'];
