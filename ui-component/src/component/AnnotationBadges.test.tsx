import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { GenomicFeature } from "../types";
import {
  AnnotationCell,
  AnnotationLegend,
  AnnotationPopover,
  useAnnotationPopover,
} from "./AnnotationBadges";

function PopoverHarness() {
  const { popover, toggle, close } = useAnnotationPopover();
  return (
    <>
      <AnnotationCell
        summary="Pfam: PF00001,PF00002"
        rowId={1}
        openKey={popover?.key ?? null}
        onToggle={toggle}
      />
      <AnnotationPopover state={popover} onClose={close} />
    </>
  );
}

function feature(id: number, functionalSummary: string): GenomicFeature {
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
    functional_summary: functionalSummary,
  };
}

describe("annotation badges", () => {
  it("opens the source values and closes the popover with Escape", () => {
    render(<PopoverHarness />);

    const badge = screen.getByRole("button", { name: "Pfam: 2 values" });
    fireEvent.click(badge);

    expect(badge.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Pfam annotations" })).toBeTruthy();
    expect(screen.getByText("PF00001")).toBeTruthy();
    expect(screen.getByText("PF00002")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(badge.getAttribute("aria-expanded")).toBe("false");
  });

  it("counts each annotation source once per loaded feature", () => {
    render(
      <AnnotationLegend
        results={[
          feature(1, "Pfam: PF00001 | pfam: PF00002 | GO: GO:0001"),
          feature(2, "Pfam: PF00003"),
        ]}
      />,
    );

    expect(screen.getByLabelText("Pfam: 2 loaded features")).toBeTruthy();
    expect(screen.getByLabelText("GO: 1 loaded feature")).toBeTruthy();
  });
});
