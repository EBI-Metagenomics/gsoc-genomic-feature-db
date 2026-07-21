// useDbSearch.ts — React hook that manages the SQLite Web Worker lifecycle and
// exposes a simple search interface to the UI.

import { useCallback, useEffect, useRef, useState } from "react";
import * as Comlink from "comlink";
import { DB_URL, MIN_QUERY_LENGTH } from "../config";
import type { WorkerApi, GenomicFeature, SearchPageResult, SequenceRegion } from "../workers/db.worker";

// Re-export types so consumers don't need to import from the worker file.
export type { GenomicFeature, SearchPageResult, SequenceRegion };

export interface UseDbSearchReturn {
  /** Current search results */
  results: GenomicFeature[];
  /** Whether the WASM DB is still loading */
  loading: boolean;
  /** Whether a search query is in-flight */
  searching: boolean;
  /** Whether a later result page is in-flight */
  loadingMore: boolean;
  /** Whether SQLite may have another page for the active search */
  hasMore: boolean;
  /** Informational status message */
  status: string;
  /** Error message, if any */
  error: string | null;
  /** Time the last query took (ms) */
  elapsed: number;
  /** Trigger an all-fields search. Debounced in the component layer. */
  search: (query: string) => Promise<void>;
  /** Append the next page for the active query. */
  loadMore: () => Promise<void>;
}

interface ActiveSearch {
  generation: number;
  query: string;
}

function appendUniqueFeatures(current: GenomicFeature[], incoming: GenomicFeature[]): GenomicFeature[] {
  const seen = new Set(current.map((feature) => Number(feature.id)));
  const appended = incoming.filter((feature) => {
    const id = Number(feature.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return appended.length > 0 ? [...current, ...appended] : current;
}

export function useDbSearch(): UseDbSearchReturn {
  const workerRef = useRef<Comlink.Remote<WorkerApi> | null>(null);
  const rawWorkerRef = useRef<Worker | null>(null);
  const generationRef = useRef(0);
  const activeSearchRef = useRef<ActiveSearch | null>(null);
  const nextCursorRef = useRef<number | null>(null);
  const hasMoreRef = useRef(false);
  const loadMoreInFlightRef = useRef(false);

  const [results, setResults] = useState<GenomicFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState("Initialising…");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // ---- Boot: fetch DB + init worker ----
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        // 1. Spin up the Web Worker
        const raw = new Worker(
          new URL("../workers/db.worker.ts", import.meta.url),
          { type: "module" }
        );
        rawWorkerRef.current = raw;
        const proxy = Comlink.wrap<WorkerApi>(raw);
        workerRef.current = proxy;

        // 2. Let the worker open the remote database
        setStatus("Connecting to database…");
        const msg = await proxy.initFromUrl(DB_URL);

        if (!cancelled) {
          setStatus(msg);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? String(err));
          setStatus("Failed to initialise database.");
          setLoading(false);
        }
      }
    }

    boot();

    return () => {
      cancelled = true;
      generationRef.current += 1;
      activeSearchRef.current = null;
      rawWorkerRef.current?.terminate();
    };
  }, []);

  // ---- Search ----
  const search = useCallback(async (query: string) => {
    const generation = ++generationRef.current;
    const activeSearch = { generation, query };
    activeSearchRef.current = activeSearch;
    nextCursorRef.current = null;
    hasMoreRef.current = false;
    loadMoreInFlightRef.current = false;

    setResults([]);
    setElapsed(0);
    setHasMore(false);
    setLoadingMore(false);
    setError(null);

    // Skip the worker round-trip until the query meets the minimum length.
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSearching(false);
      return;
    }
    if (!workerRef.current) return;

    setSearching(true);
    try {
      const res = await workerRef.current.searchPage(query);
      if (activeSearchRef.current !== activeSearch) return;

      setResults(res.features);
      setElapsed(res.elapsed_ms);
      nextCursorRef.current = res.next_cursor;
      hasMoreRef.current = res.has_more;
      setHasMore(res.has_more);
    } catch (err: any) {
      if (activeSearchRef.current !== activeSearch) return;
      setError(err.message ?? String(err));
      setResults([]);
      nextCursorRef.current = null;
      hasMoreRef.current = false;
      setHasMore(false);
    } finally {
      if (activeSearchRef.current === activeSearch) setSearching(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    const activeSearch = activeSearchRef.current;
    const cursor = nextCursorRef.current;
    if (
      !workerRef.current ||
      !activeSearch ||
      cursor === null ||
      !hasMoreRef.current ||
      loadMoreInFlightRef.current
    ) {
      return;
    }

    loadMoreInFlightRef.current = true;
    setLoadingMore(true);
    setError(null);

    try {
      const res = await workerRef.current.searchPage(
        activeSearch.query,
        undefined,
        cursor
      );
      if (activeSearchRef.current !== activeSearch) return;

      setResults((current) => appendUniqueFeatures(current, res.features));
      setElapsed((current) => current + res.elapsed_ms);
      nextCursorRef.current = res.next_cursor;
      hasMoreRef.current = res.has_more;
      setHasMore(res.has_more);
    } catch (err: any) {
      if (activeSearchRef.current !== activeSearch) return;
      // Preserve the accepted rows, cursor, and hasMore state so this page can
      // be retried without restarting the search.
      setError(err.message ?? String(err));
    } finally {
      if (activeSearchRef.current === activeSearch) {
        loadMoreInFlightRef.current = false;
        setLoadingMore(false);
      }
    }
  }, []);

  return {
    results,
    loading,
    searching,
    loadingMore,
    hasMore,
    status,
    error,
    elapsed,
    search,
    loadMore,
  };
}
