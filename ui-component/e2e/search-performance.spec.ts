import { expect, type Locator, type Page, test } from "@playwright/test";

import { accession } from "./dataset";

const SEARCH_BUDGET_MS = 3_000;
const query = `${accession}_00001`;

async function timedSearch(page: Page, input: Locator): Promise<number> {
  const startedAt = Date.now();
  await input.fill(query);
  await input.press("Enter");
  await expect(
    page.getByRole("button", {
      name: query,
      exact: true,
    }),
  ).toBeVisible();
  return Date.now() - startedAt;
}

test("completes cold and hot searches within three seconds", async ({ page }) => {
  await page.goto("/");

  const input = page.getByRole("searchbox", { name: "Search genomic features" });
  await expect(input).toBeEnabled({ timeout: 60_000 });

  const coldSearchMs = await timedSearch(page, input);

  await input.fill("");
  await expect(page.getByRole("button", { name: query, exact: true })).toHaveCount(0);

  const hotSearchMs = await timedSearch(page, input);

  expect(coldSearchMs, `cold search took ${coldSearchMs} ms`).toBeLessThan(SEARCH_BUDGET_MS);
  expect(hotSearchMs, `hot search took ${hotSearchMs} ms`).toBeLessThan(SEARCH_BUDGET_MS);
});
