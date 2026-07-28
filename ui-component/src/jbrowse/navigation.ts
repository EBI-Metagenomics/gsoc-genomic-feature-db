import type { GenomicFeature } from "../types";

function safeCoordinate(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite GFF coordinate`);
  }
  return Math.max(1, Math.floor(value));
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
  if (!feature.seqid.trim()) {
    throw new TypeError("seqid must not be empty");
  }
  const start = safeCoordinate(Math.min(feature.start, feature.end), "start");
  const end = safeCoordinate(Math.max(feature.start, feature.end), "end");
  const flank = Math.max(0, Math.floor(flankBp));
  return `${feature.seqid}:${Math.max(1, start - flank)}..${end + flank}`;
}
