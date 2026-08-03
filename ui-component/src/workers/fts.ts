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

// A GFF Dbxref-style token such as GeneID:54998. The namespace is limited to
// characters that unicode61 stores as one token with tokenchars '_.'; the value
// is sanitised separately below and may yield one or more safe tokens.
const NAMESPACED_TERM_RE = /^([a-zA-Z][a-zA-Z0-9_.]*):(.*)$/;

function sanitiseTerms(value: string): string[] {
  return value
    .replace(SANITISE_RE, " ")
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(TRIM_RE, "").trim())
    .filter((term) => term.length > 0);
}

function quoteTerm(term: string, prefix: boolean): string {
  const quoted = `"${term.replace(/"/g, '""')}"`;
  return prefix ? `${quoted}*` : quoted;
}

// Build a column-scoped (or all-columns) MATCH expression, or null when the input
// has nothing usable. null → the worker returns an empty result set.
export function buildMatchExpression(query: string, column?: string): string | null {
  const sanitised = query.replace(SANITISE_RE, " ").trim();

  // Gate: require a minimum query length before touching the database.
  if (sanitised.length < MIN_QUERY_LENGTH) return null;

  // Ordinary input is split into terms, trimmed, then wrapped in double quotes
  // before the '*' prefix. Quoting is per-term (never the whole string), so
  // each quoted string holds exactly one token — this is NOT a phrase query, which
  // detail=column cannot serve. The quotes exist to get punctuated IDs past FTS5's
  // query-expression parser: '.' / '-' are not bareword chars in that grammar, so a
  // bare NR_135138.1 throws "fts5: syntax error near '.'". Inside quotes the parser
  // treats the term as a literal string and hands it to the unicode61 tokenizer,
  // where tokenchars '_.' keeps it as the single token stored in the index.
  // Namespace:value segments are the exception: the namespace and any nested
  // namespace components are exact, while only the final value remains a prefix.
  // This avoids scans of common prefixes such as GeneID* and HGNC*.
  // Treat optional whitespace after a namespace separator as part of the same
  // lookup, so `GeneID: 4567` and `GeneID:4567` have identical semantics.
  const normalisedQuery = query.replace(/([a-zA-Z][a-zA-Z0-9_.]*):\s+/g, "$1:");
  const ftsQuery = normalisedQuery
    .trim()
    .split(/\s+/)
    .flatMap((segment) => {
      const namespaced = segment.match(NAMESPACED_TERM_RE);
      if (namespaced) {
        const namespaceTerms = sanitiseTerms(namespaced[1]);
        const wildcardOnlyValue = /^\*+$/.test(namespaced[2].trim());
        if (namespaceTerms.length === 1 && wildcardOnlyValue) {
          // `GeneID:*` means any value in the exact GeneID namespace. The value
          // itself is database-dependent, so no value token belongs in MATCH.
          return [quoteTerm(namespaceTerms[0], false)];
        }
        const valueParts = namespaced[2].split(":");
        const intermediateTerms = valueParts.slice(0, -1).flatMap((part) => sanitiseTerms(part));
        const valueTerms = sanitiseTerms(valueParts[valueParts.length - 1]);
        if (namespaceTerms.length === 1 && valueTerms.length > 0) {
          return [
            quoteTerm(namespaceTerms[0], false),
            ...intermediateTerms.map((term) => quoteTerm(term, false)),
            ...valueTerms.map((term) => quoteTerm(term, true)),
          ];
        }
      }

      return sanitiseTerms(segment).map((term) => quoteTerm(term, true));
    })
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
