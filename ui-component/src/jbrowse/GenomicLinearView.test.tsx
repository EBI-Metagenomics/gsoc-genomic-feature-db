import { act, render, waitFor } from "@testing-library/react";
import { runInAction } from "mobx";
import { describe, expect, it, vi } from "vitest";

import type { GenomicDataset, GenomicFeature } from "../types";
import GenomicLinearView from "./GenomicLinearView";

interface MockViewState {
  id: number;
  session: {
    view: {
      initialized: boolean;
      navToLocString: ReturnType<typeof vi.fn>;
      setHighlight: ReturnType<typeof vi.fn>;
    };
  };
}

const createdStates = vi.hoisted(() => [] as MockViewState[]);

vi.mock("@jbrowse/react-linear-genome-view2", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  const { observable } = await vi.importActual<typeof import("mobx")>("mobx");
  return {
    useCreateViewState: () => {
      const [state] = React.useState(() => {
        const initialized = observable.box(false);
        const value: MockViewState = {
          id: createdStates.length + 1,
          session: {
            view: {
              get initialized() {
                return initialized.get();
              },
              set initialized(value: boolean) {
                initialized.set(value);
              },
              navToLocString: vi.fn(async () => undefined),
              setHighlight: vi.fn(),
            },
          },
        };
        createdStates.push(value);
        return value;
      });
      return state;
    },
    JBrowseLinearGenomeView: ({ viewState }: { viewState: { id: number } }) => (
      <div data-testid="jbrowse" data-state-id={viewState.id} />
    ),
  };
});

const dataset: GenomicDataset = {
  accession: "first",
  databaseUrl: "/first.db.zip",
  fastaUrl: "/first.fna",
  fastaIndexUrl: "/first.fna.fai",
  gffUrl: "/first.gff.gz",
  gffIndexUrl: "/first.gff.gz.tbi",
};

const selectedFeature: GenomicFeature = {
  id: 1,
  feature_id: "feature-1",
  name: "",
  feature_type: "gene",
  seqid: "contig-1",
  start: 100,
  end: 200,
  strand: "+",
  biotype: "",
  description: "",
  functional_summary: "",
};

describe("GenomicLinearView", () => {
  it("keeps view state stable across ordinary rerenders", () => {
    const { container, getByTestId, rerender } = render(<GenomicLinearView dataset={dataset} />);
    const stateId = getByTestId("jbrowse").dataset.stateId;

    rerender(<GenomicLinearView dataset={{ ...dataset }} maxHeight={500} />);

    expect(getByTestId("jbrowse").dataset.stateId).toBe(stateId);
    const wrapper = container.querySelector<HTMLElement>(".cvf-jbrowse");
    expect(wrapper?.style.maxHeight).toBe("500px");
    expect(wrapper?.style.height).toBe("");
    expect(wrapper?.style.minHeight).toBe("");
    expect(wrapper?.dataset.annotationTrackActive).toBe("true");
  });

  it("recreates view state when the accession changes", () => {
    const { getByTestId, rerender } = render(<GenomicLinearView dataset={dataset} />);
    const stateId = getByTestId("jbrowse").dataset.stateId;

    rerender(<GenomicLinearView dataset={{ ...dataset, accession: "second" }} />);

    expect(getByTestId("jbrowse").dataset.stateId).not.toBe(stateId);
  });

  it("navigates the latest pending feature after initialization", async () => {
    const { container, rerender } = render(
      <GenomicLinearView
        dataset={dataset}
        selectedFeature={selectedFeature}
        navigationFlankBp={50}
      />,
    );
    const state = createdStates[createdStates.length - 1];

    rerender(
      <GenomicLinearView
        dataset={dataset}
        selectedFeature={{ ...selectedFeature, start: 500, end: 600 }}
        navigationFlankBp={50}
      />,
    );
    act(() => {
      runInAction(() => {
        state.session.view.initialized = true;
      });
    });

    await waitFor(() => {
      expect(state.session.view.navToLocString).toHaveBeenCalledWith("contig-1:450..650", "first");
    });
    expect(state.session.view.setHighlight).toHaveBeenCalledWith([
      {
        refName: "contig-1",
        start: 499,
        end: 600,
        assemblyName: "first",
        label: "feature-1",
      },
    ]);
    expect(state.session.view.navToLocString).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(container.querySelector(".cvf-jbrowse")?.getAttribute("data-visible-location")).toBe(
        "contig-1:450..650",
      );
      expect(
        container.querySelector(".cvf-jbrowse")?.getAttribute("data-annotation-track-active"),
      ).toBe("true");
    });
  });

  it("replaces the previous highlight when another result is selected", async () => {
    const { rerender } = render(
      <GenomicLinearView dataset={dataset} selectedFeature={selectedFeature} />,
    );
    const state = createdStates[createdStates.length - 1];

    act(() => {
      runInAction(() => {
        state.session.view.initialized = true;
      });
    });

    await waitFor(() => expect(state.session.view.setHighlight).toHaveBeenCalledTimes(1));

    rerender(
      <GenomicLinearView
        dataset={dataset}
        selectedFeature={{
          ...selectedFeature,
          id: 2,
          feature_id: "feature-2",
          start: 900,
          end: 1_000,
        }}
      />,
    );

    await waitFor(() => {
      expect(state.session.view.setHighlight).toHaveBeenLastCalledWith([
        expect.objectContaining({
          label: "feature-2",
          start: 899,
          end: 1_000,
        }),
      ]);
    });
  });

  it("shows a clear error when the selected reference is unavailable", async () => {
    const navigationError = new Error('Reference sequence "missing-contig" not found');
    const onError = vi.fn();
    const { findByRole } = render(
      <GenomicLinearView
        dataset={dataset}
        selectedFeature={{ ...selectedFeature, seqid: "missing-contig" }}
        onError={onError}
      />,
    );
    const state = createdStates[createdStates.length - 1];
    state.session.view.navToLocString.mockRejectedValueOnce(navigationError);

    act(() => {
      runInAction(() => {
        state.session.view.initialized = true;
      });
    });

    const alert = await findByRole("alert");
    expect(alert.textContent).toContain(
      'Could not navigate the genome browser: Reference sequence "missing-contig" not found',
    );
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(navigationError);
  });
});
