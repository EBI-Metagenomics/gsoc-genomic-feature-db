// parse.ts — turns a functional_summary string into ordered, grouped sources for
// the badge UI. The string format ("tag: v1, v2 | tag2: v3") is produced by
// scripts/parser.py, so these delimiters must match that writer.

import { SOURCE_BY_KEY, SOURCE_ORDER, TAG_TO_SOURCE, type SourceMeta } from "./sources";

// Delimiters of the functional_summary wire format (see scripts/parser.py).
const SEGMENT_SEP = " | "; // between "tag: values" segments
const KEY_VALUE_SEP = ": "; // between a tag and its values
const VALUE_SEP = ","; // between values within a tag

interface TagGroup {
  tag: string; // original GFF tag (preserved for the "Other" popover)
  values: string[];
}

export interface ParsedSource {
  meta: SourceMeta;
  values: string[]; // all values merged across the source's tags (deduped)
  tagGroups: TagGroup[]; // per-tag breakdown (used by the "Other" popover)
}

// Parse a functional_summary into ordered sources. Empty array when nothing to show.
export function parseAnnotations(summary: string | null | undefined): ParsedSource[] {
  if (!summary) return [];

  const byKey = new Map<string, { values: string[]; seen: Set<string>; tagGroups: TagGroup[] }>();

  for (const segment of summary.split(SEGMENT_SEP)) {
    const sep = segment.indexOf(KEY_VALUE_SEP);
    if (sep === -1) continue;

    const tag = segment.substring(0, sep).trim();
    const values = segment
      .substring(sep + KEY_VALUE_SEP.length)
      .split(VALUE_SEP)
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length === 0) continue;

    const key = TAG_TO_SOURCE[tag.toLowerCase()] ?? "other";
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { values: [], seen: new Set(), tagGroups: [] };
      byKey.set(key, bucket);
    }
    bucket.tagGroups.push({ tag, values });
    for (const v of values) {
      // Dedupe merged values (e.g. kegg + ko may repeat) while preserving order.
      if (!bucket.seen.has(v)) {
        bucket.seen.add(v);
        bucket.values.push(v);
      }
    }
  }

  return Array.from(byKey.entries())
    .map(([key, bucket]) => ({
      meta: SOURCE_BY_KEY[key],
      values: bucket.values,
      tagGroups: bucket.tagGroups,
    }))
    .sort((a, b) => SOURCE_ORDER[a.meta.key] - SOURCE_ORDER[b.meta.key]);
}
