import { describe, expect, it } from "vitest";

import { featureToHighlight, featureToLocation } from "./navigation";

const feature = {
  feature_id: "feature-1",
  seqid: "contig_1",
  start: 2_000,
  end: 2_500,
};

describe("featureToLocation", () => {
  it("adds one-based flanks to both sides", () => {
    expect(featureToLocation({ seqid: "contig_1", start: 2_000, end: 2_500 })).toBe(
      "contig_1:1000..3500",
    );
  });

  it("clamps the start coordinate to one", () => {
    expect(featureToLocation({ seqid: "contig_1", start: 50, end: 100 }, 1_000)).toBe(
      "contig_1:1..1100",
    );
  });

  it("supports no flank and normalises reversed coordinates", () => {
    expect(featureToLocation({ seqid: "contig_1", start: 20, end: 10 }, 0)).toBe("contig_1:10..20");
  });

  it("converts one-based inclusive GFF coordinates to a JBrowse highlight", () => {
    expect(featureToHighlight(feature, "assembly-1")).toEqual({
      refName: "contig_1",
      start: 1_999,
      end: 2_500,
      assemblyName: "assembly-1",
      label: "feature-1",
    });
  });

  it("normalizes reversed coordinates and clamps the internal start to zero", () => {
    expect(
      featureToHighlight(
        {
          feature_id: "feature-2",
          seqid: "contig_1",
          start: 20,
          end: 1,
        },
        "assembly-1",
      ),
    ).toMatchObject({
      start: 0,
      end: 20,
    });
  });

  it("rejects an empty assembly name", () => {
    expect(() => featureToHighlight(feature, "  ")).toThrow("assemblyName must not be empty");
  });
});
