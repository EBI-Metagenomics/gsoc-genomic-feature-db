import type { GenomicFeature } from "../types";

interface NormalizedFeatureCoordinates {
  refName: string;
  start: number;
  end: number;
}

export interface FeatureHighlight {
  refName: string;
  start: number;
  end: number;
  assemblyName: string;
  label: string;
}

function safeCoordinate(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite GFF coordinate`);
  }
  return Math.max(1, Math.floor(value));
}

function normalizeFeatureCoordinates(
  feature: Pick<GenomicFeature, "seqid" | "start" | "end">,
): NormalizedFeatureCoordinates {
  if (!feature.seqid.trim()) {
    throw new TypeError("seqid must not be empty");
  }

  return {
    refName: feature.seqid,
    start: safeCoordinate(Math.min(feature.start, feature.end), "start"),
    end: safeCoordinate(Math.max(feature.start, feature.end), "end"),
  };
}

/**
 * Convert one-based inclusive GFF coordinates into a JBrowse location string.
 *
 * The optional flank is applied in base pairs and the resulting start is clamped
 * to one, preserving the coordinate system used by GFF and JBrowse location text.
 */
export function featureToLocation(
  feature: Pick<GenomicFeature, "seqid" | "start" | "end">,
  flankBp = 1_000,
): string {
  const { refName, start, end } = normalizeFeatureCoordinates(feature);
  const flank = Math.max(0, Math.floor(flankBp));
  return `${refName}:${Math.max(1, start - flank)}..${end + flank}`;
}

/** Convert one-based inclusive GFF coordinates into one native JBrowse highlight. */
export function featureToHighlight(
  feature: Pick<GenomicFeature, "feature_id" | "seqid" | "start" | "end">,
  assemblyName: string,
): FeatureHighlight {
  if (!assemblyName.trim()) {
    throw new TypeError("assemblyName must not be empty");
  }

  const { refName, start, end } = normalizeFeatureCoordinates(feature);
  return {
    refName,
    start: start - 1,
    end,
    assemblyName,
    label: feature.feature_id,
  };
}
