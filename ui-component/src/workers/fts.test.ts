import { describe, expect, it } from "vitest";

import searchQualityFixture from "../test/search-quality-cases.json";
import { buildMatchExpression } from "./fts";

describe("buildMatchExpression", () => {
  it("rejects short or wildcard-only input", () => {
    expect(buildMatchExpression("ab")).toBeNull();
    expect(buildMatchExpression("****")).toBeNull();
  });

  it.each(["FBgn*", "FBGN*", "PF*", "pf*"])(
    "builds a case-preserving prefix search for %s",
    (query) => {
      expect(buildMatchExpression(query)).toBe(`"${query.slice(0, -1)}"*`);
    },
  );

  it("treats a namespace wildcard as any database-provided value", () => {
    expect(buildMatchExpression("GeneID:*")).toBe('"GeneID"');
  });

  it("accepts namespaced values with or without whitespace", () => {
    expect(buildMatchExpression("GeneID:4567")).toBe('"GeneID" "4567"*');
    expect(buildMatchExpression("GeneID: 4567")).toBe('"GeneID" "4567"*');
  });

  it("sanitises punctuation without creating an FTS phrase query", () => {
    expect(buildMatchExpression("kinase/receptor")).toBe('"kinase"* "receptor"*');
    expect(buildMatchExpression("GCF_000001.4")).toBe('"GCF_000001.4"*');
  });

  it("always builds an all-field expression", () => {
    expect(buildMatchExpression("kinase")).toBe('"kinase"*');
  });

  it.each(searchQualityFixture.cases)(
    "builds the fixed MGYG expression for $id",
    ({ query, match_expression }) => {
      expect(buildMatchExpression(query)).toBe(match_expression);
    },
  );
});
