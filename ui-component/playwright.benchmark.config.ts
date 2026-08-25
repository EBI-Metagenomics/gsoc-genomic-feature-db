import { statSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig, devices } from "@playwright/test";

const databasePath = process.env.BENCHMARK_DATABASE_PATH;
const browserChannel =
  process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined);

if (databasePath) {
  const resolvedDatabasePath = resolve(databasePath);
  process.env.BENCHMARK_DATABASE_PATH = resolvedDatabasePath;
  process.env.VITE_BENCHMARK_DATABASE_URL = "/__benchmark__/database.db.zip";
  process.env.VITE_BENCHMARK_DATABASE_SIZE_BYTES = String(statSync(resolvedDatabasePath).size);
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "browser-benchmark.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30 * 60_000,
  expect: {
    timeout: 120_000,
  },
  reporter: "list",
  globalSetup: "./e2e/benchmarkServer.ts",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium-benchmark",
      use: {
        ...devices["Desktop Chrome"],
        ...(browserChannel ? { channel: browserChannel } : {}),
      },
    },
  ],
});
