// fts.ts — builds the FTS5 MATCH expression from raw user input.
//
// Kept separate from the worker (which owns the SQLite handle) so the query-
// building rules are pure and unit-testable. The FTS5 index (see
// scripts/database.py) is built with detail=column, columnsize=1 and
// tokenize='unicode61 tokenchars '_.''.

import { MIN_QUERY_LENGTH, FTS_COLUMNS, type FtsColumn } from "../config";

// Drop everything except word chars, '_' / '.' (token characters) and '*'. Because
// '_' and '.' are token chars, identifiers like BU_ATCC8492 or GCF_000001.4 stay a
// SINGLE token; all other punctuation becomes a space to avoid an implicit phrase
// query, which detail=column cannot serve (no within-column token positions).
const SANITISE_RE = /[^a-zA-Z0-9_.*]/g;

// Strip leading/trailing hyphens and wildcards from a term to prevent FTS5 syntax
// errors. '_' and '.' mid/edge are valid token characters and kept.
const TRIM_RE = /^[-*]+|[-*]+$/g;

// Build a column-scoped (or all-columns) MATCH expression, or null when the input
// has nothing usable. null → the worker returns an empty result set.
export function buildMatchExpression(query: string, column?: string): string | null {
  const sanitised = query.replace(SANITISE_RE, " ").trim();

  // Gate: require a minimum query length before touching the database.
  if (sanitised.length < MIN_QUERY_LENGTH) return null;

  // Split into terms, trim stray hyphens/wildcards, then wrap EACH term in double
  // quotes before the '*' prefix. Quoting is per-term (never the whole string), so
  // each quoted string holds exactly one token — this is NOT a phrase query, which
  // detail=column cannot serve. The quotes exist to get punctuated IDs past FTS5's
  // query-expression parser: '.' / '-' are not bareword chars in that grammar, so a
  // bare NR_135138.1 throws "fts5: syntax error near '.'". Inside quotes the parser
  // treats the term as a literal string and hands it to the unicode61 tokenizer,
  // where tokenchars '_.' keeps it as the single token stored in the index.
  const ftsQuery = sanitised
    .split(/\s+/)
    .map((t) => t.replace(TRIM_RE, "").trim())
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"*`)
    .join(" ");

  // Guard against input that sanitises down to nothing usable (e.g. "____").
  if (ftsQuery.length === 0) return null;

  // Column-scoped search (the payoff of detail=column): `col : (term1* term2*)`.
  // The column is interpolated into MATCH, so it MUST pass the FTS_COLUMNS
  // allow-list first; an unknown/absent column falls back to an all-columns match.
  return column && (FTS_COLUMNS as readonly string[]).includes(column)
    ? `${column as FtsColumn} : (${ftsQuery})`
    : ftsQuery;
}
