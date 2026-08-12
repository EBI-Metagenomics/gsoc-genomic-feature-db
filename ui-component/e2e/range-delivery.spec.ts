import { expect, test } from "@playwright/test";

import { runtimeAssets } from "./dataset";

const RANGE_END = 31;

test("serves every runtime asset as a bounded byte range", async ({ request }) => {
  for (const [name, path] of Object.entries(runtimeAssets)) {
    const response = await request.get(path, {
      headers: { Range: `bytes=0-${RANGE_END}` },
    });
    const headers = response.headers();
    const body = await response.body();

    expect(response.status(), name).toBe(206);
    expect(headers["accept-ranges"], name).toBe("bytes");
    expect(headers["content-range"], name).toMatch(/^bytes 0-31\/\d+$/);
    expect(Number(headers["content-length"]), name).toBe(RANGE_END + 1);
    expect(body.byteLength, name).toBe(RANGE_END + 1);

    if (name === "database") {
      expect(body.subarray(0, 16).toString("utf8")).toBe("SQLite format 3\0");
    }
    if (name === "gff") {
      expect(headers["content-encoding"]).toBeUndefined();
      expect([...body.subarray(0, 2)]).toEqual([0x1f, 0x8b]);
    }
  }
});

test("rejects an unsatisfiable database range instead of returning the full file", async ({
  request,
}) => {
  const path = runtimeAssets.database;
  const response = await request.get(path, { headers: { Range: "bytes=999999999-" } });

  expect(response.status()).toBe(416);
  expect(response.headers()["content-range"]).toBe("bytes */18558976");
  expect((await response.body()).byteLength).toBe(0);
});
