import * as Comlink from "comlink";
import { useCallback, useEffect, useRef, useState } from "react";

import { MIN_QUERY_LENGTH } from "../config";
import type { GenomicFeature } from "../types";
import type { WorkerApi } from "../workers/db.worker";
import {
  appendUniqueFeatures,
  errorMessage,
  type ActiveSearch,
  type UseDbSearchReturn,
} from "./dbSearchState";

export type { SearchPageResult, SequenceRegion } from "../workers/db.worker";
export type { GenomicFeature } from "../types";
export type { UseDbSearchReturn } from "./dbSearchState";

/**
 * Owns a SQLite HTTP-VFS worker for one exact raw database URL.
 *
 * Changing `databaseUrl` disposes the old worker and clears accession state.
 */
export function useDbSearch(databaseUrl: string): UseDbSearchReturn {
  const workerRef = useRef<Comlink.Remote<WorkerApi> | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    const rawWorker = new Worker(new URL("../workers/db.worker.ts", import.meta.url), {
      type: "module",
    });
    const proxy = Comlink.wrap<WorkerApi>(rawWorker);

    workerRef.current = proxy;

    async function boot(): Promise<void> {
      await Promise.resolve();
      if (cancelled) return;
      activeSearchRef.current = null;
      nextCursorRef.current = null;
      hasMoreRef.current = false;
      loadMoreInFlightRef.current = false;
      setResults([]);
      setLoading(true);
      setSearching(false);
      setLoadingMore(false);
      setHasMore(false);
      setError(null);
      setElapsed(0);
      setStatus("Connecting to database…");
      try {
        const message = await proxy.initFromUrl(databaseUrl);
        if (!cancelled) {
          setStatus(message);
          setLoading(false);
        }
      } catch (caught: unknown) {
        if (!cancelled) {
          setError(errorMessage(caught));
          setStatus("Failed to initialise database.");
          setLoading(false);
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
      activeSearchRef.current = null;
      proxy[Comlink.releaseProxy]();
      rawWorker.terminate();
      if (workerRef.current === proxy) workerRef.current = null;
    };
  }, [databaseUrl]);

  const search = useCallback(async (query: string) => {
    const activeSearch = { query };
    activeSearchRef.current = activeSearch;
    nextCursorRef.current = null;
    hasMoreRef.current = false;
    loadMoreInFlightRef.current = false;
    setResults([]);
    setElapsed(0);
    setHasMore(false);
    setLoadingMore(false);
    setError(null);

    const worker = workerRef.current;
    if (query.trim().length < MIN_QUERY_LENGTH || !worker) {
      setSearching(false);
      return;
    }

    setSearching(true);
    try {
      const page = await worker.searchPage(query);
      if (activeSearchRef.current !== activeSearch) return;
      setResults(page.features);
      setElapsed(page.elapsed_ms);
      nextCursorRef.current = page.next_cursor;
      hasMoreRef.current = page.has_more;
      setHasMore(page.has_more);
    } catch (caught: unknown) {
      if (activeSearchRef.current !== activeSearch) return;
      setError(errorMessage(caught));
      setResults([]);
      nextCursorRef.current = null;
      hasMoreRef.current = false;
      setHasMore(false);
    } finally {
      if (activeSearchRef.current === activeSearch) setSearching(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    const worker = workerRef.current;
    const activeSearch = activeSearchRef.current;
    const cursor = nextCursorRef.current;
    if (
      !worker ||
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
      const page = await worker.searchPage(activeSearch.query, undefined, cursor);
      if (activeSearchRef.current !== activeSearch) return;
      setResults((current) => appendUniqueFeatures(current, page.features));
      setElapsed((current) => current + page.elapsed_ms);
      nextCursorRef.current = page.next_cursor;
      hasMoreRef.current = page.has_more;
      setHasMore(page.has_more);
    } catch (caught: unknown) {
      if (activeSearchRef.current === activeSearch) {
        setError(errorMessage(caught));
      }
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
