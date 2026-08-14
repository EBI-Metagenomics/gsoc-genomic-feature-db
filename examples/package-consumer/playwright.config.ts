import { defineConfig, devices } from "@playwright/test";

const preview = process.env.PACKAGE_CONSUMER_PREVIEW === "1";
const port = preview ? 4181 : 4180;
const browserChannel =
  process.env.PLAYWRIGHT_CHANNEL ??
  (process.platform === "win32" ? "msedge" : undefined);

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 60_000 },
  globalSetup: "./e2e/testServer.ts",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: preview ? "packed-production" : "packed-development",
      use: {
        ...devices["Desktop Chrome"],
        ...(browserChannel ? { channel: browserChannel } : {}),
      },
    },
  ],
});
