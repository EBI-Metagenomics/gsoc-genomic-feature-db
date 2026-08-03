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
    searching: false,
    loadingMore: false,
    hasMore: false,
    status: "ready",
    error: null,
    elapsed: 1,
    search: vi.fn(),
    loadMore: vi.fn(),
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
    expect(searchHook).toHaveBeenLastCalledWith("/second.db.zip");
  });

  it("shows a useful database or search failure", () => {
    searchHook.mockReturnValue(searchState({ error: "Database request failed" }));

    render(<GenomicFeatureBrowser dataset={dataset} />);

    expect(screen.getByRole("alert").textContent).toContain(
      "Search error: Database request failed",
    );
  });
});
