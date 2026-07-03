// SearchBar.tsx — orchestrates the search experience: owns query/column state and
// the debounce timer, then composes SearchForm (input row) and ResultsTable
// (matches) with the annotation legend/popover.

import { useCallback, useEffect, useRef, useState } from "react";
import { DEBOUNCE_MS, MIN_QUERY_LENGTH } from "../config";
import type { GenomicFeature } from "../hooks/useDbSearch";
import SearchForm from "./SearchForm";
import ResultsTable from "./ResultsTable";
import {
  AnnotationLegend,
  AnnotationPopover,
  useAnnotationPopover,
} from "./AnnotationBadges";

interface SearchBarProps {
  results: GenomicFeature[];
  loading: boolean;
  searching: boolean;
  status: string;
  error: string | null;
  elapsed: number;
  search: (query: string, column?: string) => Promise<void>;
}

export default function SearchBar({
  results,
  loading,
  searching,
  error,
  elapsed,
  search,
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  // Selected FTS column to scope the search to ("all" = match every column).
  const [column, setColumn] = useState<string>("all");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Single open-at-a-time annotation popover (see AnnotationBadges).
  const { popover, toggle: toggleAnnotation, close: closeAnnotation } = useAnnotationPopover();

  // A new result set invalidates the anchored popover (stale rect / row); close it.
  useEffect(() => {
    closeAnnotation();
  }, [results, closeAnnotation]);

  // Debounce live-search; below the minimum length, clear results immediately.
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);

      if (timerRef.current) clearTimeout(timerRef.current);

      if (val.trim().length >= MIN_QUERY_LENGTH) {
        timerRef.current = setTimeout(() => {
          search(val, column);
        }, DEBOUNCE_MS);
      } else {
        search("");
      }
    },
    [search, column]
  );

  // Changing the column re-runs the current query immediately against the new scope.
  const handleColumnChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const col = e.target.value;
      setColumn(col);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (query.trim().length >= MIN_QUERY_LENGTH) search(query, col);
    },
    [query, search]
  );

  // Explicit submit (button click or Enter): cancel any pending debounce and run
  // the search immediately rather than waiting out the debounce window.
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (timerRef.current) clearTimeout(timerRef.current);
      const val = query.trim();
      search(val.length >= MIN_QUERY_LENGTH ? query : "", column);
    },
    [query, column, search]
  );

  // Cleanup the pending debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="vf-stack vf-stack--400">
      <SearchForm
        query={query}
        column={column}
        loading={loading}
        searching={searching}
        onQueryChange={handleChange}
        onColumnChange={handleColumnChange}
        onSubmit={handleSubmit}
      />

      {/* Error banner */}
      {error && (
        <div className="vf-banner vf-banner--alert vf-banner--danger">
          <p className="vf-banner__text">⚠️ {error}</p>
        </div>
      )}

      {/* Results meta */}
      {!loading && results.length > 0 && (
        <p className="cvf-search-meta">
          {results.length} result{results.length !== 1 ? "s" : ""} in {elapsed.toFixed(1)} ms
        </p>
      )}

      {/* Annotation legend: decodes the letter badges for the sources on screen */}
      {results.length > 0 && <AnnotationLegend results={results} />}

      {/* Results table */}
      {results.length > 0 && (
        <ResultsTable
          results={results}
          openKey={popover?.key ?? null}
          onToggleAnnotation={toggleAnnotation}
        />
      )}

      {/* Empty state */}
      {!loading && query.trim().length >= MIN_QUERY_LENGTH && !searching && results.length === 0 && (
        <p className="vf-text-body vf-u-text-color--grey" style={{ textAlign: "center", marginTop: "2rem" }}>
          No features matched "{query}".
        </p>
      )}

      {/* Single annotation popover, portal-rendered to escape the table's overflow */}
      <AnnotationPopover state={popover} onClose={closeAnnotation} />
    </div>
  );
}
