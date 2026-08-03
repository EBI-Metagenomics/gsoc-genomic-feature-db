import { expect, test } from "@playwright/test";

import { runtimeAssets } from "./dataset";

test("serves runtime assets as raw bytes with range and CORS support", async ({ request }) => {
  const responses = await Promise.all(
    Object.values(runtimeAssets).map((path) =>
      request.get(path, {
        headers: { Range: "bytes=0-15" },
      }),
    ),
  );

  for (const response of responses) {
    expect(response.status()).toBe(206);
    expect(response.headers()["accept-ranges"]).toBe("bytes");
    expect(response.headers()["access-control-allow-origin"]).toBe("*");
    expect(response.headers()["content-range"]).toMatch(/^bytes 0-15\//);
    expect(response.headers()["content-encoding"]).toBeUndefined();
  }

  expect((await responses[0].body()).subarray(0, 15).toString()).toBe("SQLite format 3");
  expect((await responses[1].body()).subarray(0, 1).toString()).toBe(">");
  expect([...(await responses[2].body()).subarray(0, 2)]).toEqual([0x1f, 0x8b]);
});
