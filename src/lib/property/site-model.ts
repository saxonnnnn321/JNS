/**
 * How a cadastral plan becomes an estimate of what you actually have to mow.
 *
 * These are ASSUMPTIONS, not measurements. A lot boundary tells you the size of
 * the block and nothing else — it does not know where the house, driveway, pool
 * or garden beds are. Everything here is the typical NSW detached-housing case,
 * and every one of these numbers is why the estimate carries a confidence score
 * and stays editable on screen.
 *
 * The photo step replaces the guessing with looking.
 */
export const SITE_MODEL = {
  /** Site coverage assumed when no building footprint could be found. */
  assumedBuildingCoverage: 0.32,

  /** Driveway, paths and patio, as a share of the block. */
  hardSurfaceFraction: 0.12,
  hardSurfaceMinM2: 40,
  hardSurfaceMaxM2: 180,

  /** Of what is left once building and paving come off, the share in beds. */
  bedShareOfSoftArea: 0.15,

  /** Edging: fence lines you actually snip, plus around the house and drive. */
  edgeShareOfPerimeter: 0.55,
  edgeAroundStructuresM: 25,
  bedEdgeShareOfPerimeter: 0.35,

  /** Blocks outside this range are not ordinary suburban housing. */
  plausibleParcelMinM2: 150,
  plausibleParcelMaxM2: 2000,

  confidence: {
    /** A real footprint from OSM, on a normal-sized block. */
    measuredFootprint: 0.72,
    /** Block size from the cadastre, but the house area is assumed. */
    assumedFootprint: 0.52,
    /** Penalty when the block is outside the plausible suburban range. */
    unusualParcelPenalty: 0.15,
    /** Penalty when the address service had to guess. */
    fuzzyAddressPenalty: 0.12,
  },
} as const;
