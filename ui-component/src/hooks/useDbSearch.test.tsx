import { act, renderHook, waitFor } from "@testing-library/react";
import * as Comlink from "comlink";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GenomicFeature } from "../types";
import type { SearchPageResult } from "../workers/db.worker";
import { useDbSearch } from "./useDbSearch";

const workerProxies = vi.hoisted(() => [] as Array<Record<string | symbol, unknown>>);

vi.mock("comlink", () => ({
  releaseProxy: Symbol("releaseProxy"),
  wrap: vi.fn(() => workerProxies.shift()),
}));

class WorkerMock {
  static instances: WorkerMock[] = [];

  terminate = vi.fn();

  constructor() {
    WorkerMock.instances.push(this);
  }
}

function createProxy() {
  return {
    initFromUrl: vi.fn(async (url: string) => `ready: ${url}`),
    searchPage: vi.fn(async (): Promise<SearchPageResult> => ({
      features: [],
      elapsed_ms: 0,
      next_cursor: null,
      has_more: false,
    })),
    [Comlink.releaseProxy]: vi.fn(),
  };
}

function feature(id: number): GenomicFeature {
  return {
    id,
    feature_id: `feature-${id}`,
    name: "",
    feature_type: "gene",
    seqid: "contig-1",
    start: 10,
    end: 20,
    strand: "+",
    biotype: "",
    description: "",
    functional_summary: "",
  };
}

describe("useDbSearch", () => {
  beforeEach(() => {
    WorkerMock.instances = [];
    vi.stubGlobal("Worker", WorkerMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("replaces the worker and clears results when the URL changes", async () => {
    const firstProxy = createProxy();
    const secondProxy = createProxy();
    firstProxy.searchPage.mockResolvedValueOnce({
      features: [feature(1)],
      elapsed_ms: 1,
      next_cursor: null,
      has_more: false,
    });
    workerProxies.push(firstProxy, secondProxy);

    const { result, rerender } = renderHook(({ databaseUrl }) => useDbSearch(databaseUrl), {
      initialProps: { databaseUrl: "/first.db.zip" },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.search("old-feature"));
    expect(result.current.results).toHaveLength(1);

    rerender({ databaseUrl: "/second.db.zip" });

    await waitFor(() => {
      expect(secondProxy.initFromUrl).toHaveBeenCalledWith("/second.db.zip");
      expect(result.current.results).toEqual([]);
    });
    expect(firstProxy[Comlink.releaseProxy]).toHaveBeenCalledOnce();
    expect(WorkerMock.instances[0].terminate).toHaveBeenCalledOnce();
    expect(WorkerMock.instances).toHaveLength(2);
  });

  it("terminates its worker when unmounted", async () => {
    const proxy = createProxy();
    workerProxies.push(proxy);
    const { unmount } = renderHook(() => useDbSearch("/features.db.zip"));

    await waitFor(() => expect(proxy.initFromUrl).toHaveBeenCalledOnce());
    unmount();

    expect(proxy[Comlink.releaseProxy]).toHaveBeenCalledOnce();
    expect(WorkerMock.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it("returns the number of unique features appended by load more", async () => {
    const proxy = createProxy();
    proxy.searchPage
      .mockResolvedValueOnce({
        features: [feature(1)],
        elapsed_ms: 1,
        next_cursor: 1,
        has_more: true,
      })
      .mockResolvedValueOnce({
        features: [feature(1), feature(2)],
        elapsed_ms: 2,
        next_cursor: null,
        has_more: false,
      });
    workerProxies.push(proxy);

    const { result } = renderHook(() => useDbSearch("/features.db.zip"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.search("feature"));

    let addedCount = 0;
    await act(async () => {
      addedCount = await result.current.loadMore();
    });

    expect(addedCount).toBe(1);
    expect(result.current.results.map((item) => item.id)).toEqual([1, 2]);
    expect(result.current.hasMore).toBe(false);
  });
});
