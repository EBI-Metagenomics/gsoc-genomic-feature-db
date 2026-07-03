// useDbSearch.ts — React hook that manages the SQLite Web Worker lifecycle and
// exposes a simple search interface to the UI.

import { useCallback, useEffect, useRef, useState } from "react";
import * as Comlink from "comlink";
import { DB_URL, MIN_QUERY_LENGTH } from "../config";
import type { WorkerApi, GenomicFeature, SearchResult, SequenceRegion } from "../workers/db.worker";

// Re-export types so consumers don't need to import from the worker file.
export type { GenomicFeature, SearchResult, SequenceRegion };
// Re-export the column list from its source of truth (config) for convenience.
export { SEARCHABLE_COLUMNS } from "../config";

export interface UseDbSearchReturn {
  /** Current search results */
  results: GenomicFeature[];
  /** Whether the WASM DB is still loading */
  loading: boolean;
  /** Whether a search query is in-flight */
  searching: boolean;
  /** Informational status message */
  status: string;
  /** Error message, if any */
  error: string | null;
  /** Time the last query took (ms) */
  elapsed: number;
  /** Trigger a search, optionally scoped to a single FTS column. Debounced in the component layer. */
  search: (query: string, column?: string) => Promise<void>;
}

export function useDbSearch(): UseDbSearchReturn {
  const workerRef = useRef<Comlink.Remote<WorkerApi> | null>(null);
  const rawWorkerRef = useRef<Worker | null>(null);

  const [results, setResults] = useState<GenomicFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
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
      rawWorkerRef.current?.terminate();
    };
  }, []);

  // ---- Search ----
  const search = useCallback(async (query: string, column?: string) => {
    if (!workerRef.current) return;
    // Skip the worker round-trip until the query meets the minimum length.
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setElapsed(0);
      return;
    }

    setSearching(true);
    try {
      const res = await workerRef.current.search(query, column);
      setResults(res.features);
      setElapsed(res.elapsed_ms);
      setError(null);
    } catch (err: any) {
      setError(err.message ?? String(err));
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  return {
    results,
    loading,
    searching,
    status,
    error,
    elapsed,
    search,
  };
}
