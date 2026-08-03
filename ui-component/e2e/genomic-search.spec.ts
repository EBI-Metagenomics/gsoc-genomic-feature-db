import { expect, test } from "@playwright/test";

import { accession, assetRoot, runtimeAssets } from "./dataset";

test("searches the real database and navigates JBrowse with keyboard controls", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  const datasetRequests = new Set<string>();
  const rangedRequests = new Set<string>();
  const partialResponses = new Set<string>();

  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith(assetRoot)) return;
    datasetRequests.add(url.pathname);
    if (request.headers().range) rangedRequests.add(url.pathname);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (response.status() === 206) partialResponses.add(url.pathname);
  });

  await page.goto("/");

  const selector = page.getByRole("combobox", { name: "Genome accession" });
  await expect(selector).toHaveCount(0);

  const searchInput = page.getByRole("searchbox", { name: "Search genomic features" });
  await expect(searchInput).toBeEnabled({ timeout: 60_000 });
  await searchInput.focus();
  await expect(searchInput).toBeFocused();

  await searchInput.fill(`${accession}_00001`);
  await searchInput.press("Enter");

  const featureLink = page.getByRole("button", {
    name: `${accession}_00001`,
    exact: true,
  });
  await expect(featureLink).toBeVisible({ timeout: 60_000 });
  await featureLink.focus();
  await expect(featureLink).toHaveCSS("outline-width", "3px");
  await page.keyboard.press("Enter");

  await expect(featureLink).toHaveAttribute("aria-current", "location");
  await expect(page.locator(".cvf-jbrowse")).toHaveAttribute(
    "data-visible-location",
    `${accession}_1:247..3660`,
    { timeout: 60_000 },
  );

  const zoomIn = page.getByLabel("Zoom in 2x");
  await zoomIn.click();
  await zoomIn.click();
  await zoomIn.click();

  await expect
    .poll(() => Object.values(runtimeAssets).every((path) => rangedRequests.has(path)))
    .toBe(true);
  await expect
    .poll(() => Object.values(runtimeAssets).every((path) => partialResponses.has(path)))
    .toBe(true);

  expect([...datasetRequests].every((path) => path.startsWith(assetRoot))).toBe(true);
  expect([...datasetRequests].some((path) => path.endsWith(".gff"))).toBe(false);
  expect(browserErrors).toEqual([]);
});
