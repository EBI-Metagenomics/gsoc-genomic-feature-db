import { expect, test } from "@playwright/test";

const accession = "MGYG000490722";

function coordinates(position: string) {
  const match = position.replace(/,/g, "").match(/^(.+):(\d+)-(\d+)$/);
  if (!match) throw new Error(`Unexpected result position: ${position}`);
  return { seqid: match[1], start: Number(match[2]), end: Number(match[3]) };
}

test("loads packed worker/WASM, searches, paginates, and replaces the exact highlight", async ({
  page,
}) => {
  const runtimeAssets = { worker: false, wasm: false };
  const browserErrors: string[] = [];
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (/db\.worker(?:-[^/]+)?\.js$/.test(pathname) && response.ok())
      runtimeAssets.worker = true;
    if (/\.wasm$/.test(pathname) && response.ok()) runtimeAssets.wasm = true;
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/");
  const search = page.getByRole("searchbox", {
    name: "Search genomic features",
  });
  await expect(search).toBeEnabled();
  await expect.poll(() => runtimeAssets.worker).toBe(true);
  await expect.poll(() => runtimeAssets.wasm).toBe(true);
  await expect(page.locator("body")).toHaveCSS("margin", "13px");
  await expect(page.locator("#root")).toHaveCSS("display", "block");

  await search.fill(`${accession}_1`);
  await search.press("Enter");
  const rows = page.locator(".cvf-results-wrapper tbody tr");
  await expect(rows).toHaveCount(25);
  await page.getByRole("button", { name: "Load More" }).click();
  await expect(rows).toHaveCount(50);

  async function selectFeature(featureId: string) {
    await search.fill(featureId);
    await search.press("Enter");
    const result = page.locator(".cvf-results-table").getByRole("button", {
      name: featureId,
      exact: true,
    });
    await expect(result).toBeVisible();
    const position = coordinates(
      (await result.locator("xpath=ancestor::tr/td[3]").innerText()).trim(),
    );
    await result.click();
    const browser = page.locator(".cvf-jbrowse");
    await expect(browser).toHaveAttribute(
      "data-highlighted-feature",
      featureId,
    );
    await expect(browser).toHaveAttribute(
      "data-highlighted-interval",
      `${position.seqid}:${position.start - 1}..${position.end}`,
    );
    await expect(browser).toHaveAttribute(
      "data-visible-location",
      `${position.seqid}:${Math.max(1, position.start - 1000)}..${position.end + 1000}`,
    );
    await expect(page.getByTestId("host-selected-feature")).toHaveText(
      featureId,
    );
    await expect(
      browser.getByRole("button", { name: featureId, exact: true }),
    ).toBeVisible();
    return `${position.seqid}:${position.start - 1}..${position.end}`;
  }

  const firstInterval = await selectFeature(`${accession}_00001`);
  const secondInterval = await selectFeature(`${accession}_00002`);
  expect(secondInterval).not.toBe(firstInterval);
  await expect(
    page.locator(".cvf-jbrowse").getByRole("button", {
      name: `${accession}_00001`,
      exact: true,
    }),
  ).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});
