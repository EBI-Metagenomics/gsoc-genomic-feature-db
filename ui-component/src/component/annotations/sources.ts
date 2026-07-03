// sources.ts — the annotation source catalogue: which badge letter, label and
// colours each functional-annotation source gets, plus the GFF-tag → source map.
// Domain data kept beside the parser (like scripts/parser.py's tag handling),
// not in the global config.

export interface SourceMeta {
  key: string; // canonical source id (one per visual badge)
  letter: string; // glyph shown in the badge
  label: string; // human label (legend + popover title)
  color: string; // foreground / border
  bg: string; // badge background
}

// Canonical badge order — also the order sources appear in a cell and the legend,
// so the same letter always sits in a predictable spot when scanning the column.
export const SOURCES: SourceMeta[] = [
  { key: "pfam", letter: "P", label: "Pfam", color: "#1d4ed8", bg: "#eff6ff" },
  { key: "interpro", letter: "I", label: "InterPro", color: "#4f46e5", bg: "#eef2ff" },
  { key: "kegg", letter: "K", label: "KEGG", color: "#047857", bg: "#ecfdf5" },
  { key: "go", letter: "G", label: "GO", color: "#b91c1c", bg: "#fef2f2" },
  { key: "ec", letter: "E", label: "EC", color: "#a16207", bg: "#fefce8" },
  { key: "eggnog", letter: "N", label: "eggNOG", color: "#c2410c", bg: "#fff7ed" },
  { key: "cog", letter: "C", label: "COG", color: "#9333ea", bg: "#faf5ff" },
  { key: "dbxref", letter: "X", label: "DbXref", color: "#0e7490", bg: "#ecfeff" },
  { key: "other", letter: "⋯", label: "Other", color: "#4b5563", bg: "#f3f4f6" },
];

export const SOURCE_BY_KEY: Record<string, SourceMeta> = Object.fromEntries(
  SOURCES.map((s) => [s.key, s])
);
export const SOURCE_ORDER: Record<string, number> = Object.fromEntries(
  SOURCES.map((s, i) => [s.key, i])
);

// GFF attribute tag (lower-cased) → canonical source key. Related tags collapse
// onto one badge (e.g. ko / kegg_pathway → KEGG). Tags absent here fall into
// "other", which the popover still lists grouped by their original tag name.
export const TAG_TO_SOURCE: Record<string, string> = {
  pfam: "pfam",
  interpro: "interpro",
  kegg: "kegg",
  ko: "kegg",
  kegg_ko: "kegg",
  kegg_pathway: "kegg",
  pathway: "kegg",
  go: "go",
  ontology_term: "go",
  ec_number: "ec",
  eggnog: "eggnog",
  cog: "cog",
  dbxref: "dbxref",
};
