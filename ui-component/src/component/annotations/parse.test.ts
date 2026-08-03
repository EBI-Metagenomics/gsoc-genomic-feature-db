import { describe, expect, it } from "vitest";

import { parseAnnotations } from "./parse";

describe("parseAnnotations", () => {
  it("returns no sources for empty or malformed summaries", () => {
    expect(parseAnnotations(undefined)).toEqual([]);
    expect(parseAnnotations("not a tagged annotation")).toEqual([]);
  });

  it("groups aliases, deduplicates values, and uses curated source order", () => {
    const parsed = parseAnnotations(
      "GO: GO:0001 | ko: K00001,K00001 | Pfam: PF00001 | kegg_pathway: K00001,K00002",
    );

    expect(parsed.map((source) => source.meta.key)).toEqual(["pfam", "kegg", "go"]);
    expect(parsed.find((source) => source.meta.key === "kegg")?.values).toEqual([
      "K00001",
      "K00002",
    ]);
  });

  it("preserves unknown tags and their values under Other", () => {
    const [other] = parseAnnotations("CustomTag: alpha,beta | another: gamma");

    expect(other.meta.key).toBe("other");
    expect(other.values).toEqual(["alpha", "beta", "gamma"]);
    expect(other.tagGroups).toEqual([
      { tag: "CustomTag", values: ["alpha", "beta"] },
      { tag: "another", values: ["gamma"] },
    ]);
  });
});
