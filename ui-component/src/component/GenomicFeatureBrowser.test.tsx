import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GenomicDataset, GenomicFeature } from "../types";
import GenomicFeatureBrowser from "./GenomicFeatureBrowser";

const feature: GenomicFeature = {
  id: 7,
  feature_id: "gene-7",
  name: "dnaA",
  feature_type: "gene",
  seqid: "contig-1",
  start: 100,
  end: 200,
  strand: "+",
  biotype: "",
  description: "Replication initiator",
  functional_summary: "",
};

const searchHook = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useDbSearch", () => ({ useDbSearch: searchHook }));
vi.mock("../jbrowse/GenomicLinearView", () => ({
  default: ({ selectedFeature }: { selectedFeature?: GenomicFeature | null }) => (
    <output data-testid="selected-feature">{selectedFeature?.feature_id ?? "none"}</output>
  ),
}));

const dataset: GenomicDataset = {
  accession: "first",
  databaseUrl: "/first.db.zip",
  fastaUrl: "/first.fna",
  fastaIndexUrl: "/first.fna.fai",
  gffUrl: "/first.gff.gz",
  gffIndexUrl: "/first.gff.gz.tbi",
};

function searchState(overrides: Record<string, unknown> = {}) {
  return {
    results: [feature],
    loading: false,
    ready: true,
    searching: false,
    loadingMore: false,
    hasMore: false,
    status: "ready",
    error: null,
    elapsed: 1,
    mode: "range",
    progress: null,
    diagnostics: null,
    canFallback: false,
    search: vi.fn(),
    loadMore: vi.fn(),
    retry: vi.fn(),
    downloadFullDatabase: vi.fn(),
    ...overrides,
  };
}

describe("GenomicFeatureBrowser", () => {
  it("selects a result for navigation and calls the public callback", () => {
    const onFeatureSelect = vi.fn();
    searchHook.mockReturnValue(searchState());
    render(<GenomicFeatureBrowser dataset={dataset} onFeatureSelect={onFeatureSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "gene-7" }));

    expect(screen.getByTestId("selected-feature").textContent).toBe("gene-7");
    expect(screen.getByRole("button", { name: "gene-7" }).getAttribute("aria-current")).toBe(
      "location",
    );
    expect(onFeatureSelect).toHaveBeenCalledWith(feature);
  });

  it("clears selection and uses the new database on dataset change", () => {
    searchHook.mockReturnValue(searchState());
    const { rerender } = render(<GenomicFeatureBrowser dataset={dataset} />);
    fireEvent.click(screen.getByRole("button", { name: "gene-7" }));

    rerender(
      <GenomicFeatureBrowser
        dataset={{
          ...dataset,
          accession: "second",
          databaseUrl: "/second.db.zip",
        }}
      />,
    );

    expect(screen.getByTestId("selected-feature").textContent).toBe("none");
    expect(searchHook).toHaveBeenLastCalledWith("/second.db.zip", {
      expectedSizeBytes: undefined,
      sha256: undefined,
    });
  });

  it("shows a useful database or search failure", () => {
    searchHook.mockReturnValue(searchState({ error: "Database request failed" }));

    render(<GenomicFeatureBrowser dataset={dataset} />);

    expect(screen.getByRole("alert").textContent).toContain(
      "Database or search error: Database request failed",
    );
  });

  it("offers retry and an explicit full-download fallback after range failure", () => {
    const retry = vi.fn();
    const downloadFullDatabase = vi.fn();
    searchHook.mockReturnValue(
      searchState({
        results: [],
        error: "Range loading is unavailable",
        canFallback: true,
        retry,
        downloadFullDatabase,
      }),
    );

    render(<GenomicFeatureBrowser dataset={{ ...dataset, databaseSizeBytes: 18_558_976 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry connection" }));
    fireEvent.click(screen.getByRole("button", { name: /Download complete database/ }));

    expect(retry).toHaveBeenCalledOnce();
    expect(downloadFullDatabase).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /17.7 MiB/ })).toBeTruthy();
  });

  it("labels result counts as loaded and reports whether another page exists", () => {
    searchHook.mockReturnValue(searchState({ hasMore: true }));
    const { rerender } = render(<GenomicFeatureBrowser dataset={dataset} />);

    expect(document.querySelector(".cvf-search-meta > span[aria-hidden='true']")?.textContent).toBe(
      "1 result loaded in 1.0 ms. More results are available.",
    );

    searchHook.mockReturnValue(searchState({ hasMore: false }));
    rerender(<GenomicFeatureBrowser dataset={dataset} />);

    expect(document.querySelector(".cvf-search-meta > span[aria-hidden='true']")?.textContent).toBe(
      "1 result loaded in 1.0 ms. All matching results are loaded.",
    );
  });

  it("labels result counts as loaded and reports whether another page exists", () => {
    searchHook.mockReturnValue(searchState({ hasMore: true }));
    const { rerender } = render(<GenomicFeatureBrowser dataset={dataset} />);

    expect(document.querySelector(".cvf-search-meta > span[aria-hidden='true']")?.textContent).toBe(
      "1 result loaded in 1.0 ms. More results are available.",
    );

    searchHook.mockReturnValue(searchState({ hasMore: false }));
    rerender(<GenomicFeatureBrowser dataset={dataset} />);

    expect(document.querySelector(".cvf-search-meta > span[aria-hidden='true']")?.textContent).toBe(
      "1 result loaded in 1.0 ms. All matching results are loaded.",
    );
  });

  it("labels result counts as loaded and reports whether another page exists", () => {
    searchHook.mockReturnValue(searchState({ hasMore: true }));
    const { rerender } = render(<GenomicFeatureBrowser dataset={dataset} />);

    expect(document.querySelector(".cvf-search-meta > span[aria-hidden='true']")?.textContent).toBe(
      "1 result loaded in 1.0 ms. More results are available.",
    );

    searchHook.mockReturnValue(searchState({ hasMore: false }));
    rerender(<GenomicFeatureBrowser dataset={dataset} />);

    expect(document.querySelector(".cvf-search-meta > span[aria-hidden='true']")?.textContent).toBe(
      "1 result loaded in 1.0 ms. All matching results are loaded.",
    );
  });
});
