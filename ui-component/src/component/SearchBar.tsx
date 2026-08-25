// SearchBar.tsx — orchestrates the search experience: owns query state and
// the debounce timer, then composes SearchForm (input row) and ResultsTable
// (matches) with the annotation legend/popover.

import { useCallback, useEffect, useRef, useState } from "react";
import { DEBOUNCE_MS, MIN_QUERY_LENGTH } from "../config";
import type { GenomicFeature } from "../types";
import SearchForm from "./SearchForm";
import ResultsTable from "./ResultsTable";
import FeatureTypeFacets from "./FeatureTypeFacets";
import { AnnotationLegend, AnnotationPopover, useAnnotationPopover } from "./AnnotationBadges";

interface SearchBarProps {
  results: GenomicFeature[];
  selectedFeature: GenomicFeature | null;
  onSelectFeature: (feature: GenomicFeature) => void;
  loading: boolean;
  searching: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  elapsed: number;
  search: (query: string) => Promise<void>;
  loadMore: () => Promise<number>;
}

export default function SearchBar({
  results,
  selectedFeature,
  onSelectFeature,
  loading,
  searching,
  loadingMore,
  hasMore,
  elapsed,
  search,
  loadMore,
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [paginationAnnouncement, setPaginationAnnouncement] = useState("");
  const [focusResultIndex, setFocusResultIndex] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadMoreButtonRef = useRef<HTMLButtonElement | null>(null);
  const loadMoreRequestRef = useRef(0);

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
      setPaginationAnnouncement("");
      setFocusResultIndex(null);
      loadMoreRequestRef.current += 1;

      if (timerRef.current) clearTimeout(timerRef.current);

      if (val.trim().length >= MIN_QUERY_LENGTH) {
        timerRef.current = setTimeout(() => {
          search(val);
        }, DEBOUNCE_MS);
      } else {
        search("");
      }
    },
    [search],
  );

  // Explicit submit (button click or Enter): cancel any pending debounce and run
  // the search immediately rather than waiting out the debounce window.
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (timerRef.current) clearTimeout(timerRef.current);
      setPaginationAnnouncement("");
      setFocusResultIndex(null);
      loadMoreRequestRef.current += 1;
      const val = query.trim();
      search(val.length >= MIN_QUERY_LENGTH ? query : "");
    },
    [query, search],
  );

  const handleLoadMore = useCallback(() => {
    const requestId = loadMoreRequestRef.current + 1;
    const startIndex = results.length;
    loadMoreRequestRef.current = requestId;
    setFocusResultIndex(startIndex);
    setPaginationAnnouncement("Loading more results.");

    void loadMore().then(
      (addedCount) => {
        if (loadMoreRequestRef.current !== requestId) return;
        if (addedCount > 0) {
          setPaginationAnnouncement(
            `${addedCount} more result${addedCount === 1 ? "" : "s"} loaded. ${startIndex + addedCount} results loaded.`,
          );
        } else {
          setFocusResultIndex(null);
          setPaginationAnnouncement("No additional results were loaded.");
          loadMoreButtonRef.current?.focus();
        }
      },
      () => {
        if (loadMoreRequestRef.current !== requestId) return;
        setFocusResultIndex(null);
        setPaginationAnnouncement("More results could not be loaded.");
        loadMoreButtonRef.current?.focus();
      },
    );
  }, [loadMore, results.length]);

  const handleResultFocusComplete = useCallback(() => {
    setFocusResultIndex(null);
  }, []);

  // Cleanup the pending debounce timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const resultMeta = `${results.length} result${results.length !== 1 ? "s" : ""} loaded in ${elapsed.toFixed(1)} ms. ${hasMore ? "More results are available." : "All matching results are loaded."}`;

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
          <span aria-hidden="true">{resultMeta}</span>
          <span className="vf-u-sr-only" role="status" aria-live="polite" aria-atomic="true">
            {paginationAnnouncement || resultMeta}
          </span>
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
            selectedFeature={selectedFeature}
            onSelectFeature={onSelectFeature}
            openKey={popover?.key ?? null}
            onToggleAnnotation={toggleAnnotation}
            focusResultIndex={focusResultIndex}
            onResultFocusComplete={handleResultFocusComplete}
          />
          {hasMore && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <button
                ref={loadMoreButtonRef}
                type="button"
                className="vf-button vf-button--secondary"
                onClick={handleLoadMore}
                disabled={loadingMore}
                aria-busy={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load More"}
              </button>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!loading &&
        query.trim().length >= MIN_QUERY_LENGTH &&
        !searching &&
        results.length === 0 && (
          <p
            role="status"
            aria-live="polite"
            className="vf-text-body vf-u-text-color--grey"
            style={{ textAlign: "center", marginTop: "2rem" }}
          >
            No features matched "{query}".
          </p>
        )}

      {/* Single annotation popover, portal-rendered to escape the table's overflow */}
      <AnnotationPopover state={popover} onClose={closeAnnotation} />
    </div>
  );
}
