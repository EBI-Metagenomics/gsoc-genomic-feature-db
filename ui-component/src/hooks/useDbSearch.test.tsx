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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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

  it("ignores a previous database initialisation after the URL changes", async () => {
    const firstProxy = createProxy();
    const firstInitialisation = deferred<string>();
    firstProxy.initFromUrl.mockReturnValueOnce(firstInitialisation.promise);
    const secondProxy = createProxy();
    workerProxies.push(firstProxy, secondProxy);

    const { result, rerender } = renderHook(({ databaseUrl }) => useDbSearch(databaseUrl), {
      initialProps: { databaseUrl: "/first.db.zip" },
    });
    await waitFor(() => expect(firstProxy.initFromUrl).toHaveBeenCalledOnce());

    rerender({ databaseUrl: "/second.db.zip" });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toBe("ready: /second.db.zip");

    await act(async () => {
      firstInitialisation.resolve("ready: /first.db.zip");
      await firstInitialisation.promise;
    });
    expect(result.current.status).toBe("ready: /second.db.zip");
    expect(firstProxy[Comlink.releaseProxy]).toHaveBeenCalledOnce();
    expect(WorkerMock.instances[0].terminate).toHaveBeenCalledOnce();
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

  it("does not let an older search response replace a newer search", async () => {
    const proxy = createProxy();
    const firstSearch = deferred<SearchPageResult>();
    const secondSearch = deferred<SearchPageResult>();
    proxy.searchPage.mockReturnValueOnce(firstSearch.promise).mockReturnValueOnce(secondSearch.promise);
    workerProxies.push(proxy);

    const { result } = renderHook(() => useDbSearch("/features.db.zip"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let firstRequest!: Promise<void>;
    let secondRequest!: Promise<void>;
    act(() => {
      firstRequest = result.current.search("older-feature");
      secondRequest = result.current.search("newer-feature");
    });

    await act(async () => {
      secondSearch.resolve({
        features: [feature(2)],
        elapsed_ms: 1,
        next_cursor: null,
        has_more: false,
      });
      await secondRequest;
    });
    await act(async () => {
      firstSearch.resolve({
        features: [feature(1)],
        elapsed_ms: 1,
        next_cursor: null,
        has_more: false,
      });
      await firstRequest;
    });

    expect(result.current.results).toEqual([feature(2)]);
    expect(result.current.searching).toBe(false);
  });

  it("reports useful initialisation and search errors", async () => {
    const proxy = createProxy();
    proxy.initFromUrl.mockRejectedValueOnce(new Error("Database file could not be opened"));
    workerProxies.push(proxy);

    const { result } = renderHook(() => useDbSearch("/invalid.db.zip"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toBe("Failed to initialise database.");
    expect(result.current.error).toBe("Database file could not be opened");

    const searchProxy = createProxy();
    searchProxy.searchPage.mockRejectedValueOnce(new Error("Search query failed"));
    workerProxies.push(searchProxy);
    const secondHook = renderHook(() => useDbSearch("/features.db.zip"));
    await waitFor(() => expect(secondHook.result.current.loading).toBe(false));
    await act(async () => secondHook.result.current.search("feature"));
    expect(secondHook.result.current.error).toBe("Search query failed");
  });

  it("allows only one load-more request while the current page is pending", async () => {
    const proxy = createProxy();
    const nextPage = deferred<SearchPageResult>();
    proxy.searchPage
      .mockResolvedValueOnce({
        features: [feature(1)],
        elapsed_ms: 1,
        next_cursor: 1,
        has_more: true,
      })
      .mockReturnValueOnce(nextPage.promise);
    workerProxies.push(proxy);

    const { result } = renderHook(() => useDbSearch("/features.db.zip"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => result.current.search("feature"));

    let firstLoad!: Promise<number>;
    let secondLoad!: Promise<number>;
    act(() => {
      firstLoad = result.current.loadMore();
      secondLoad = result.current.loadMore();
    });
    await expect(secondLoad).resolves.toBe(0);
    expect(proxy.searchPage).toHaveBeenCalledTimes(2);

    await act(async () => {
      nextPage.resolve({
        features: [feature(2)],
        elapsed_ms: 1,
        next_cursor: null,
        has_more: false,
      });
      await firstLoad;
    });
    expect(result.current.results).toEqual([feature(1), feature(2)]);
  });
});
