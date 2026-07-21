// SearchBar.tsx — orchestrates the search experience: owns query state and
// the debounce timer, then composes SearchForm (input row) and ResultsTable
// (matches) with the annotation legend/popover.

import { useCallback, useEffect, useRef, useState } from "react";
import { DEBOUNCE_MS, MIN_QUERY_LENGTH } from "../config";
import type { GenomicFeature } from "../hooks/useDbSearch";
import SearchForm from "./SearchForm";
import ResultsTable from "./ResultsTable";
import FeatureTypeFacets from "./FeatureTypeFacets";
import {
  AnnotationLegend,
  AnnotationPopover,
  useAnnotationPopover,
} from "./AnnotationBadges";

interface SearchBarProps {
  results: GenomicFeature[];
  loading: boolean;
  searching: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  elapsed: number;
  search: (query: string) => Promise<void>;
  loadMore: () => Promise<void>;
}

export default function SearchBar({
  results,
  loading,
  searching,
  loadingMore,
  hasMore,
  elapsed,
  search,
  loadMore,
}: SearchBarProps) {
  const [query, setQuery] = useState("");
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
          search(val);
        }, DEBOUNCE_MS);
      } else {
        search("");
      }
    },
    [search]
  );

  // Explicit submit (button click or Enter): cancel any pending debounce and run
  // the search immediately rather than waiting out the debounce window.
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (timerRef.current) clearTimeout(timerRef.current);
      const val = query.trim();
      search(val.length >= MIN_QUERY_LENGTH ? query : "");
    },
    [query, search]
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
        loading={loading}
        searching={searching}
        onQueryChange={handleChange}
        onSubmit={handleSubmit}
      />

      {/* Results meta */}
      {!loading && results.length > 0 && (
        <p className="cvf-search-meta">
          {results.length} result{results.length !== 1 ? "s" : ""} loaded in {elapsed.toFixed(1)} ms
        </p>
      )}

      <FeatureTypeFacets results={results} />

      {/* Annotation legend: loaded-feature coverage in the curated source order */}
      {results.length > 0 && <AnnotationLegend results={results} />}

      {/* Results table */}
      {results.length > 0 && (
        <>
          <ResultsTable
            results={results}
            openKey={popover?.key ?? null}
            onToggleAnnotation={toggleAnnotation}
          />
          {hasMore && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                type="button"
                className="vf-button vf-button--secondary"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load More"}
              </button>
            </div>
          )}
        </>
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
