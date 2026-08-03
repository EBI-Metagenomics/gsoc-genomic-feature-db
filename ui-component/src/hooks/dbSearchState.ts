import type { GenomicFeature } from "../types";

/** State and actions exposed by the browser-local SQLite search hook. */
export interface UseDbSearchReturn {
  results: GenomicFeature[];
  loading: boolean;
  searching: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  status: string;
  error: string | null;
  elapsed: number;
  search: (query: string) => Promise<void>;
  /** Load the next page and return the number of unique features appended. */
  loadMore: () => Promise<number>;
}

export interface ActiveSearch {
  query: string;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function appendUniqueFeatures(
  current: GenomicFeature[],
  incoming: GenomicFeature[],
): GenomicFeature[] {
  const seen = new Set(current.map((feature) => Number(feature.id)));
  const appended = incoming.filter((feature) => {
    const id = Number(feature.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return appended.length > 0 ? [...current, ...appended] : current;
}
