import { expect, test } from "@playwright/test";

import { runtimeAssets } from "./dataset";

const databasePattern = `**${runtimeAssets.database}`;

test("does not hide a full response behind range-loading status", async ({ page }) => {
  await page.route(databasePattern, async (route) => {
    if (route.request().headers().range) {
      await route.fulfill({
        status: 200,
        contentType: "application/vnd.sqlite3",
        body: "server ignored the Range header",
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/");

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("expected HTTP 206 but received 200");
  await expect(page.getByRole("button", { name: /Download complete database/ })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search genomic features" })).toBeDisabled();
});

test("uses the complete database only after explicit fallback selection", async ({ page }) => {
  await page.route(databasePattern, async (route) => {
    if (route.request().headers().range) {
      await route.fulfill({ status: 200, body: "range unsupported" });
      return;
    }
    await route.continue();
  });

  await page.goto("/");
  await page.getByRole("button", { name: /Download complete database/ }).click();

  await expect(page.getByRole("searchbox", { name: "Search genomic features" })).toBeEnabled({
    timeout: 60_000,
  });
  await page.getByText("Database loading diagnostics").click();
  await expect(page.getByText("Complete download", { exact: true })).toBeVisible();
  await expect(page.getByText("17.7 MiB", { exact: true })).toHaveCount(2);
});

test("recovers when the first range probe is interrupted", async ({ page }) => {
  let databaseRangeRequests = 0;
  await page.route(databasePattern, async (route) => {
    if (route.request().headers().range) {
      databaseRangeRequests += 1;
      if (databaseRangeRequests === 1) {
        await route.abort("connectionreset");
        return;
      }
    }
    await route.continue();
  });

  await page.goto("/");

  await expect(page.getByRole("searchbox", { name: "Search genomic features" })).toBeEnabled({
    timeout: 60_000,
  });
  await page.getByText("Database loading diagnostics").click();
  await expect(page.getByText("Validated byte-range loading", { exact: true })).toBeVisible();
  await expect(page.getByText("1", { exact: true }).last()).toBeVisible();
  expect(databaseRangeRequests).toBeGreaterThan(1);
});

test("keeps loading progress visible while database responses are throttled", async ({ page }) => {
  await page.route(databasePattern, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });

  await page.goto("/");

  await expect(page.getByRole("status")).toContainText(
    /Checking range support|Opening remote database/,
  );
  await expect(page.getByRole("searchbox", { name: "Search genomic features" })).toBeEnabled({
    timeout: 60_000,
  });
});
