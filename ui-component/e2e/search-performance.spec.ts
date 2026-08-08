import { expect, type Locator, type Page, test } from "@playwright/test";

import { accession } from "./dataset";

const SEARCH_BUDGET_MS = 3_000;
const exactQuery = `${accession}_00001`;
const broadQuery = "protein";
const broadFirstFeature = `${accession}_00002.t1.CDS1`;

async function timedSearch(
  page: Page,
  input: Locator,
  query: string,
  expectedFeature: string,
): Promise<number> {
  const startedAt = Date.now();
  await input.fill(query);
  await input.press("Enter");
  await expect(
    page.getByRole("button", {
      name: expectedFeature,
      exact: true,
    }),
  ).toBeVisible();
  return Date.now() - startedAt;
}

test("completes selective and broad searches within three seconds", async ({ page }) => {
  await page.goto("/");

  const input = page.getByRole("searchbox", { name: "Search genomic features" });
  await expect(input).toBeEnabled({ timeout: 60_000 });

  const coldSearchMs = await timedSearch(page, input, exactQuery, exactQuery);

  await input.fill("");
  await expect(page.getByRole("button", { name: exactQuery, exact: true })).toHaveCount(0);

  const hotSearchMs = await timedSearch(page, input, exactQuery, exactQuery);
  const broadSearchMs = await timedSearch(page, input, broadQuery, broadFirstFeature);

  expect(coldSearchMs, `cold search took ${coldSearchMs} ms`).toBeLessThan(SEARCH_BUDGET_MS);
  expect(hotSearchMs, `hot search took ${hotSearchMs} ms`).toBeLessThan(SEARCH_BUDGET_MS);
  expect(broadSearchMs, `broad search took ${broadSearchMs} ms`).toBeLessThan(SEARCH_BUDGET_MS);
});
