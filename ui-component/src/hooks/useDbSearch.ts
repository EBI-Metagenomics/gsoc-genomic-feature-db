import * as Comlink from "comlink";
import { useCallback, useEffect, useRef, useState } from "react";

import { MIN_QUERY_LENGTH } from "../config";
import type { GenomicFeature } from "../types";
import type { WorkerApi } from "../workers/db.worker";
import type {
  DatabaseIntegrity,
  DatabaseLoadMode,
  LoadingProgress,
  TransferDiagnostics,
} from "../workers/databaseTransport";
import {
  appendUniqueFeatures,
  errorMessage,
  type ActiveSearch,
  type UseDbSearchReturn,
} from "./dbSearchState";

export type { SearchPageResult, SequenceRegion } from "../workers/db.worker";
export type { GenomicFeature } from "../types";
export type { UseDbSearchReturn } from "./dbSearchState";

interface LoadRequest {
  url: string;
  mode: DatabaseLoadMode;
  attempt: number;
}

/** Own a validated range-backed SQLite worker with an explicit full-download fallback. */
export function useDbSearch(
  databaseUrl: string,
  integrity: DatabaseIntegrity = {},
): UseDbSearchReturn {
  const workerRef = useRef<Comlink.Remote<WorkerApi> | null>(null);
  const activeSearchRef = useRef<ActiveSearch | null>(null);
  const resultsRef = useRef<GenomicFeature[]>([]);
  const nextCursorRef = useRef<number | null>(null);
  const hasMoreRef = useRef(false);
  const loadMoreInFlightRef = useRef(false);
  const [loadRequest, setLoadRequest] = useState<LoadRequest>({
    url: databaseUrl,
    mode: "range",
    attempt: 0,
  });
  const mode = loadRequest.url === databaseUrl ? loadRequest.mode : "range";
  const attempt = loadRequest.url === databaseUrl ? loadRequest.attempt : 0;

  const [results, setResults] = useState<GenomicFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState("Initialising…");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState<LoadingProgress | null>(null);
  const [diagnostics, setDiagnostics] = useState<TransferDiagnostics | null>(null);
  const [initialisationFailed, setInitialisationFailed] = useState(false);

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
      resultsRef.current = [];
      setResults([]);
      setLoading(true);
      setReady(false);
      setSearching(false);
      setLoadingMore(false);
      setHasMore(false);
      setError(null);
      setElapsed(0);
      setProgress(null);
      setDiagnostics(null);
      setInitialisationFailed(false);
      setStatus(
        mode === "range" ? "Checking server range support…" : "Downloading complete database…",
      );
      const report = Comlink.proxy((nextProgress: LoadingProgress) => {
        if (!cancelled) setProgress(nextProgress);
      });
      try {
        const result = await proxy.initFromUrl(
          databaseUrl,
          {
            mode,
            expectedSizeBytes: integrity.expectedSizeBytes,
            sha256: integrity.sha256,
          },
          report,
        );
        if (!cancelled) {
          setStatus(result.message);
          setDiagnostics(result.diagnostics);
          setProgress(null);
          setLoading(false);
          setReady(true);
        }
      } catch (caught: unknown) {
        if (!cancelled) {
          setError(errorMessage(caught));
          setStatus("Failed to initialise database.");
          setInitialisationFailed(true);
          setProgress(null);
          setLoading(false);
          try {
            setDiagnostics(await proxy.getDiagnostics());
          } catch {
            // The original error is more useful if the worker itself is unavailable.
          }
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
  }, [databaseUrl, mode, attempt, integrity.expectedSizeBytes, integrity.sha256]);

  const search = useCallback(async (query: string) => {
    const activeSearch = { query };
    activeSearchRef.current = activeSearch;
    resultsRef.current = [];
    nextCursorRef.current = null;
    hasMoreRef.current = false;
    loadMoreInFlightRef.current = false;
    setResults([]);
    setElapsed(0);
    setHasMore(false);
    setLoadingMore(false);
    setError(null);
    setInitialisationFailed(false);

    const worker = workerRef.current;
    if (query.trim().length < MIN_QUERY_LENGTH || !worker) {
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const page = await worker.searchPage(query);
      if (activeSearchRef.current !== activeSearch) return;
      resultsRef.current = page.features;
      setResults(page.features);
      setElapsed(page.elapsed_ms);
      setDiagnostics(page.diagnostics);
      nextCursorRef.current = page.next_cursor;
      hasMoreRef.current = page.has_more;
      setHasMore(page.has_more);
    } catch (caught: unknown) {
      if (activeSearchRef.current !== activeSearch) return;
      setError(errorMessage(caught));
      resultsRef.current = [];
      setResults([]);
      nextCursorRef.current = null;
      hasMoreRef.current = false;
      setHasMore(false);
    } finally {
      if (activeSearchRef.current === activeSearch) setSearching(false);
    }
  }, []);

  const loadMore = useCallback(async (): Promise<number> => {
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
      return 0;
    }
    loadMoreInFlightRef.current = true;
    setLoadingMore(true);
    setError(null);
    let addedCount = 0;
    try {
      const page = await worker.searchPage(activeSearch.query, undefined, cursor);
      if (activeSearchRef.current !== activeSearch) return 0;
      const nextResults = appendUniqueFeatures(resultsRef.current, page.features);
      addedCount = nextResults.length - resultsRef.current.length;
      resultsRef.current = nextResults;
      setResults(nextResults);
      setElapsed((current) => current + page.elapsed_ms);
      setDiagnostics(page.diagnostics);
      nextCursorRef.current = page.next_cursor;
      hasMoreRef.current = page.has_more;
      setHasMore(page.has_more);
    } catch (caught: unknown) {
      if (activeSearchRef.current === activeSearch) setError(errorMessage(caught));
    } finally {
      if (activeSearchRef.current === activeSearch) {
        loadMoreInFlightRef.current = false;
        setLoadingMore(false);
      }
    }
    return addedCount;
  }, []);

  const retry = useCallback(() => {
    setLoadRequest((current) => ({
      url: databaseUrl,
      mode: current.url === databaseUrl ? current.mode : "range",
      attempt: current.url === databaseUrl ? current.attempt + 1 : 1,
    }));
  }, [databaseUrl]);

  const downloadFullDatabase = useCallback(() => {
    setLoadRequest((current) => ({
      url: databaseUrl,
      mode: "full-download",
      attempt: current.attempt + 1,
    }));
  }, [databaseUrl]);

  return {
    results,
    loading,
    ready,
    searching,
    loadingMore,
    hasMore,
    status,
    error,
    elapsed,
    mode,
    progress,
    diagnostics,
    canFallback: initialisationFailed && mode === "range",
    search,
    loadMore,
    retry,
    downloadFullDatabase,
  };
}
