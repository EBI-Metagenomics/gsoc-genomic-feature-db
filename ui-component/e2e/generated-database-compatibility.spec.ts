import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const accession = "MGYG000490723";
const databaseSizeBytes = 20_185_088;
const databaseSha256 = "583774fb242a2f0ba400f4b5aeb6c45188edf449479850a902c189e6902e7583";
const databasePath = resolve(
  import.meta.dirname,
  `../../sample_data/${accession}/${accession}.db.zip`,
);
const databaseUrl = `/${accession}/${accession}.db.zip`;

interface BrowserCompatibilityResult {
  initialisation: {
    diagnostics: {
      mode: "range" | "full-download";
      bytesReceived: number;
      operationBytesReceived: number;
    };
  };
  searches: Array<{
    features: Array<{
      feature_id: string;
      feature_type: string;
      seqid: string;
      start: number;
      end: number;
    }>;
    diagnostics: { operationBytesReceived: number };
  }>;
}

interface BrowserHarness {
  testGeneratedDatabase(
    databaseUrl: string,
    integrity: { expectedSizeBytes: number; sha256: string },
    queries: string[],
    mode?: "range" | "full-download",
  ): Promise<BrowserCompatibilityResult>;
}

test.skip(
  !existsSync(databasePath),
  `Generate ${databasePath} before running this compatibility test.`,
);

test("opens a newly generated database through guarded ranges and returns GFF coordinates", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(
    async ({ url, size, sha256 }) => {
      const modulePath = "/src/test/databaseCompatibilityHarness.ts";
      const harness = (await import(/* @vite-ignore */ modulePath)) as BrowserHarness;
      return harness.testGeneratedDatabase(url, { expectedSizeBytes: size, sha256 }, [
        "MGYG000490723_00001",
        "MGYG000490723_05372",
        "MGYG000490723_10836",
      ]);
    },
    { url: databaseUrl, size: databaseSizeBytes, sha256: databaseSha256 },
  );

  expect(result.initialisation.diagnostics.mode).toBe("range");
  expect(result.initialisation.diagnostics.bytesReceived).toBeGreaterThan(0);
  expect(result.initialisation.diagnostics.bytesReceived).toBeLessThan(databaseSizeBytes);
  expect(result.searches[0].features).toContainEqual(
    expect.objectContaining({
      feature_id: "MGYG000490723_00001",
      feature_type: "gene",
      seqid: "MGYG000490723_1",
      start: 5487,
      end: 8292,
    }),
  );
  expect(result.searches[1].features).toContainEqual(
    expect.objectContaining({
      feature_id: "MGYG000490723_05372",
      feature_type: "gene",
      seqid: "MGYG000490723_2156",
      start: 5722,
      end: 6936,
    }),
  );
  expect(result.searches[2].features).toContainEqual(
    expect.objectContaining({
      feature_id: "MGYG000490723_10836",
      feature_type: "gene",
      seqid: "MGYG000490723_4130",
      start: 1,
      end: 1076,
    }),
  );
  expect(result.searches.some((search) => search.diagnostics.operationBytesReceived > 0)).toBe(
    true,
  );
});

test("opens the generated database through the verified complete-download fallback", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(
    async ({ url, size, sha256 }) => {
      const modulePath = "/src/test/databaseCompatibilityHarness.ts";
      const harness = (await import(/* @vite-ignore */ modulePath)) as BrowserHarness;
      return harness.testGeneratedDatabase(
        url,
        { expectedSizeBytes: size, sha256 },
        ["MGYG000490723_05372"],
        "full-download",
      );
    },
    { url: databaseUrl, size: databaseSizeBytes, sha256: databaseSha256 },
  );

  expect(result.initialisation.diagnostics).toMatchObject({
    mode: "full-download",
    bytesReceived: databaseSizeBytes,
    operationBytesReceived: databaseSizeBytes,
  });
  expect(result.searches[0].features).toContainEqual(
    expect.objectContaining({
      feature_id: "MGYG000490723_05372",
      seqid: "MGYG000490723_2156",
      start: 5722,
      end: 6936,
    }),
  );
});
