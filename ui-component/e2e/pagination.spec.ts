import { expect, test } from "@playwright/test";

import { accession } from "./dataset";

test("moves focus to the first newly loaded result without selecting it", async ({ page }) => {
  await page.goto("/");

  const viewportWidth = page.viewportSize()?.width;
  expect(viewportWidth).toBeDefined();
  const appWidth = await page.locator("main.cvf-app").evaluate((app) => {
    return app.getBoundingClientRect().width;
  });
  const appWidthRatio = appWidth / viewportWidth!;
  expect(appWidthRatio).toBeGreaterThanOrEqual(0.94);
  expect(appWidthRatio).toBeLessThanOrEqual(0.96);

  const searchInput = page.getByRole("searchbox", { name: "Search genomic features" });
  await expect(searchInput).toBeEnabled({ timeout: 60_000 });
  await searchInput.fill(`${accession}_1`);
  await searchInput.press("Enter");

  const rows = page.locator(".cvf-results-wrapper tbody tr");
  await expect(rows).toHaveCount(25, { timeout: 60_000 });
  await expect(page.locator(".cvf-results-table")).toHaveCSS("font-size", "14px");
  await expect(page.locator(".cvf-results-table thead th")).toHaveText([
    "Feature ID",
    "Type",
    "Position",
    "Strand",
    "Biotype",
    "Annotations",
    "Description",
  ]);

  const loadMore = page.getByRole("button", { name: "Load More" });
  await loadMore.focus();
  await page.keyboard.press("Enter");

  await expect(rows).toHaveCount(50, { timeout: 60_000 });
  const firstNewFeature = rows.nth(25).locator(".cvf-feature-link");
  await expect(firstNewFeature).toBeFocused();
  await expect(firstNewFeature).not.toHaveAttribute("aria-current", "location");
  await expect(page.getByRole("status")).toContainText("25 more results loaded. 50 results total.");

  const rowBox = await rows.nth(25).boundingBox();
  const wrapperBox = await page.locator(".cvf-results-wrapper").boundingBox();
  expect(rowBox).not.toBeNull();
  expect(wrapperBox).not.toBeNull();
  expect(rowBox!.y).toBeGreaterThanOrEqual(wrapperBox!.y);
  expect(rowBox!.y).toBeLessThan(wrapperBox!.y + wrapperBox!.height);
});
