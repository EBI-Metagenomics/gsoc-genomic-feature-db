// config.ts - single source of truth for frontend tunable constants.

// Minimum characters before a search runs. Imported by the UI hook, the search
// form, and the worker so the UI threshold and the engine threshold never drift.
export const MIN_QUERY_LENGTH = 3;

// Debounce window (ms) between keystroke and the search firing.
export const DEBOUNCE_MS = 200;

// Rows returned by each search page. Production can request as many pages as
// needed; this value is not a total-result cap.
export const SEARCH_PAGE_SIZE = 25;

// HTTP-VFS backend tuning (sqlite-wasm-http): page size and on-demand cache.
export const HTTP_MAX_PAGE_SIZE = 8192;
export const HTTP_CACHE_SIZE = 4096; // approximately 4 MiB

// Annotation popover geometry (px): fixed width, gap below the anchor badge, and
// the minimum padding kept between the popover and the viewport edges.
export const POPOVER_WIDTH = 260;
export const POPOVER_GAP = 6;
export const VIEWPORT_PAD = 8;

// Results table column headings, in display order. Column one shows the stable
// feature_id (with the gene symbol as a subtitle), so it reads "Feature ID".
export const RESULT_TABLE_HEADINGS = [
  "Feature ID",
  "Type",
  "Position",
  "Strand",
  "Biotype",
  "Annotations",
  "Description",
] as const;

// feature_type to EBI Visual Framework badge class. Types absent here use the
// base badge (DEFAULT_BADGE_CLASS).
export const FEATURE_TYPE_BADGE_CLASS: Record<string, string> = {
  gene: "vf-badge vf-badge--primary",
  mRNA: "vf-badge vf-badge--secondary",
  CDS: "vf-badge vf-badge--tertiary",
};
export const DEFAULT_BADGE_CLASS = "vf-badge";
