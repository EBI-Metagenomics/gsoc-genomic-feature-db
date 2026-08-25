// Builds an all-field FTS5 MATCH expression from raw user input.
//
// This module is separate from the worker so the query rules remain pure and
// unit-testable. The FTS5 index is contentless and built with detail=none,
// columnsize=0, and unicode61 tokenchars for underscores and periods.

import { MIN_QUERY_LENGTH } from "../config";

// Keep word characters plus '_' / '.' (the configured token characters) and '*'.
// Other punctuation becomes a space, preventing raw FTS5 syntax or phrases.
const SANITISE_RE = /[^a-zA-Z0-9_.*]/g;
const TRIM_RE = /^[-*]+|[-*]+$/g;

// GFF Dbxref-style tokens such as GeneID:54998. The namespace is limited to
// characters kept together by unicode61 tokenchars.
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

// Build an all-field MATCH expression, or null when the input has nothing
// usable. null means the worker returns an empty result set.
export function buildMatchExpression(query: string): string | null {
  const sanitised = query.replace(SANITISE_RE, " ").trim();
  if (sanitised.length < MIN_QUERY_LENGTH) return null;

  // Each quoted term is one token, not a phrase. Quoting lets punctuated IDs
  // pass through the FTS5 expression parser to the configured tokenizer.
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

  return ftsQuery.length === 0 ? null : ftsQuery;
}
