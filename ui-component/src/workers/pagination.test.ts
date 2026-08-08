import { describe, expect, it } from "vitest";

import { boundSearchPage } from "./pagination";

describe("boundSearchPage", () => {
  it("does not advertise another page when the result count equals the page size", () => {
    const page = boundSearchPage(
      Array.from({ length: 25 }, (_, index) => ({ id: index + 1 })),
      25,
    );

    expect(page.features).toHaveLength(25);
    expect(page.nextCursor).toBe(25);
    expect(page.hasMore).toBe(false);
  });

  it("uses a lookahead row without returning it", () => {
    const page = boundSearchPage(
      Array.from({ length: 26 }, (_, index) => ({ id: index + 1 })),
      25,
    );

    expect(page.features.map((row) => row.id)).toEqual(
      Array.from({ length: 25 }, (_, index) => index + 1),
    );
    expect(page.nextCursor).toBe(25);
    expect(page.hasMore).toBe(true);
  });

  it("returns an empty terminal page", () => {
    expect(boundSearchPage([], 25)).toEqual({
      features: [],
      nextCursor: null,
      hasMore: false,
    });
  });
});
