/**
 * Cadastral plan → an estimate of what there is to mow.
 *
 * Pure and deterministic, like the pricing engine, and for the same reason: the
 * numbers have to be explainable. Every output carries a `basis` line saying
 * where it came from, because most of these are assumptions rather than
 * measurements and the operator needs to see which is which.
 */

import type { SiteMeasurements } from '../types';
import { SITE_MODEL } from './site-model';

export interface SiteEstimateInput {
  parcelAreaM2: number;
  parcelPerimeterM: number;
  /** null when no footprint could be found — then coverage is assumed. */
  buildingAreaM2: number | null;
  buildingCount?: number;
  addressExact: boolean;
}

export interface SiteEstimateResult {
  measurements: SiteMeasurements;
  confidence: number;
  basis: string[];
  warnings: string[];
  /** Subtracted from the lawn, but deliberately not quoted. See below. */
  estimatedBedAreaM2: number;
}

function round(value: number, dp = 0): number {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

export function estimateSite(input: SiteEstimateInput): SiteEstimateResult {
  const { parcelAreaM2, parcelPerimeterM, addressExact } = input;
  const basis: string[] = [];
  const warnings: string[] = [];

  basis.push(
    `Block is ${round(parcelAreaM2)} m² with a ${round(parcelPerimeterM)} m boundary, measured from the NSW cadastre.`,
  );

  // --- building ---------------------------------------------------------
  let buildingAreaM2: number;
  let confidence: number;
  if (input.buildingAreaM2 !== null && input.buildingAreaM2 > 0) {
    buildingAreaM2 = input.buildingAreaM2;
    confidence = SITE_MODEL.confidence.measuredFootprint;
    basis.push(
      `${round(buildingAreaM2)} m² of roof across ${input.buildingCount ?? 1} building${
        (input.buildingCount ?? 1) === 1 ? '' : 's'
      }, traced from OpenStreetMap.`,
    );
  } else {
    buildingAreaM2 = parcelAreaM2 * SITE_MODEL.assumedBuildingCoverage;
    confidence = SITE_MODEL.confidence.assumedFootprint;
    basis.push(
      `No building outline on file, so ${Math.round(
        SITE_MODEL.assumedBuildingCoverage * 100,
      )}% site coverage assumed (${round(buildingAreaM2)} m²).`,
    );
    warnings.push(
      'The house size is assumed, not measured — worth a look at the aerial.',
    );
  }

  // A footprint bigger than most of the block means something is wrong: bad
  // OSM tracing, or it is not a detached house.
  if (buildingAreaM2 > parcelAreaM2 * 0.7) {
    buildingAreaM2 = parcelAreaM2 * 0.7;
    confidence -= 0.15;
    warnings.push(
      'Buildings cover most of the block — this may be units or a townhouse.',
    );
  }

  // --- paving -----------------------------------------------------------
  const hardSurfaceM2 = Math.min(
    Math.max(
      parcelAreaM2 * SITE_MODEL.hardSurfaceFraction,
      SITE_MODEL.hardSurfaceMinM2,
    ),
    SITE_MODEL.hardSurfaceMaxM2,
    Math.max(0, parcelAreaM2 - buildingAreaM2),
  );
  basis.push(
    `Driveway and paths taken as ${round(hardSurfaceM2)} m² (${Math.round(
      SITE_MODEL.hardSurfaceFraction * 100,
    )}% of the block).`,
  );

  // --- what is left is garden ------------------------------------------
  const softM2 = Math.max(0, parcelAreaM2 - buildingAreaM2 - hardSurfaceM2);
  const estimatedBedAreaM2 = softM2 * SITE_MODEL.bedShareOfSoftArea;
  const lawnAreaM2 = softM2 - estimatedBedAreaM2;
  basis.push(
    `Leaves ${round(softM2)} m² of garden: ${round(lawnAreaM2)} m² lawn, with ${round(
      estimatedBedAreaM2,
    )} m² set aside as beds at the usual ${Math.round(
      SITE_MODEL.bedShareOfSoftArea * 100,
    )}/${100 - Math.round(SITE_MODEL.bedShareOfSoftArea * 100)} split.`,
  );

  // The bed area is subtracted from the lawn but NOT quoted for weeding.
  //
  // A lot boundary cannot see garden beds. Multiplying a guessed bed area by a
  // guessed weeding rate produced a $254 line item on a test quote — the single
  // biggest charge on the page, invented from two stacked assumptions. Weeding
  // is opt-in: the operator adds it once someone has actually looked.
  basis.push(
    `Weeding is left at zero — the plan cannot see beds. Add it by hand if the job needs it.`,
  );

  const edgeMetres =
    parcelPerimeterM * SITE_MODEL.edgeShareOfPerimeter +
    SITE_MODEL.edgeAroundStructuresM;
  const bedEdgeMetres = parcelPerimeterM * SITE_MODEL.bedEdgeShareOfPerimeter;
  basis.push(
    `Edging taken as ${round(edgeMetres)} m — ${Math.round(
      SITE_MODEL.edgeShareOfPerimeter * 100,
    )}% of the boundary plus ${SITE_MODEL.edgeAroundStructuresM} m around the house and drive.`,
  );

  // --- confidence -------------------------------------------------------
  if (
    parcelAreaM2 < SITE_MODEL.plausibleParcelMinM2 ||
    parcelAreaM2 > SITE_MODEL.plausibleParcelMaxM2
  ) {
    confidence -= SITE_MODEL.confidence.unusualParcelPenalty;
    warnings.push(
      `At ${round(parcelAreaM2)} m² this is not a standard suburban block — check the plan before quoting.`,
    );
  }

  if (!addressExact) {
    confidence -= SITE_MODEL.confidence.fuzzyAddressPenalty;
    warnings.push(
      'The address service had to guess at the address — make sure the match below is the right house.',
    );
  }

  return {
    measurements: {
      lawnAreaM2: round(lawnAreaM2),
      edgeMetres: round(edgeMetres),
      hardSurfaceM2: round(hardSurfaceM2),
      bedEdgeMetres: round(bedEdgeMetres),
      weedAreaM2: 0,
      hedgeMetres: 0,
      greenWasteM3: 0,
      travelKm: 0,
    },
    confidence: Math.min(1, Math.max(0, round(confidence, 2))),
    basis,
    warnings,
    estimatedBedAreaM2: round(estimatedBedAreaM2),
  };
}
