import { describe, expect, it } from "vitest";

import { featureToLocation } from "./navigation";

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
});
