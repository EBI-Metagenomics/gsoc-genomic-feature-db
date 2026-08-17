import { test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  browserEnvironment,
  createBenchmarkPage,
  initialisePage,
  measureSearch,
  portableRepositoryPath,
  repositoryRoot,
  type BenchmarkQuery,
  type InitialisationSample,
  type SearchSample,
  writeResults,
} from "./browserBenchmark";

interface QueryManifest {
  schema_version: number;
  datasets: Record<string, BenchmarkQuery[]>;
}

const queryManifestPath = resolve(
  process.env.BENCHMARK_QUERY_MANIFEST ?? resolve(repositoryRoot, "benchmark/browser-queries.json"),
);
const queryManifest = JSON.parse(readFileSync(queryManifestPath, "utf8")) as QueryManifest;
const datasetRole = process.env.BENCHMARK_BROWSER_DATASET ?? "small";
const queries = queryManifest.datasets[datasetRole];
const coldRuns = Number(process.env.BENCHMARK_COLD_RUNS ?? 3);
const warmRuns = Number(process.env.BENCHMARK_WARM_RUNS ?? 10);
const benchmarkPhase = process.env.BENCHMARK_PHASE ?? "baseline";
const outputPath = resolve(
  process.env.BENCHMARK_BROWSER_OUTPUT ??
    resolve(repositoryRoot, "benchmark/results/browser-baseline.json"),
);

if (queryManifest.schema_version !== 1 || typeof queryManifest.datasets !== "object") {
  throw new Error(`Unsupported browser query manifest: ${queryManifestPath}`);
}
if (!queries?.length) {
  throw new Error(
    `No browser queries defined for dataset key ${datasetRole} in ${queryManifestPath}`,
  );
}
if (
  queries.some(
    (query) =>
      typeof query.category !== "string" ||
      !query.category.trim() ||
      typeof query.query !== "string" ||
      !query.query.trim(),
  )
) {
  throw new Error(`Invalid browser query entry for dataset key ${datasetRole}`);
}
if (!Number.isSafeInteger(coldRuns) || coldRuns < 1) {
  throw new Error("BENCHMARK_COLD_RUNS must be a positive integer");
}
if (!Number.isSafeInteger(warmRuns) || warmRuns < 1) {
  throw new Error("BENCHMARK_WARM_RUNS must be a positive integer");
}
if (benchmarkPhase !== "baseline" && benchmarkPhase !== "final") {
  throw new Error("BENCHMARK_PHASE must be either baseline or final");
}

test("records reproducible browser database and search measurements", async ({ browser }) => {
  const initialisation: InitialisationSample[] = [];
  const searches: SearchSample[] = [];

  for (let iteration = 1; iteration <= coldRuns; iteration += 1) {
    for (const benchmarkQuery of queries) {
      const { context, page, session } = await createBenchmarkPage(browser);
      initialisation.push(await initialisePage(page, session, iteration));
      searches.push(await measureSearch(page, session, benchmarkQuery, "cold", iteration));
      await context.close();
    }
  }

  const {
    context: warmContext,
    page: warmPage,
    session: warmSession,
  } = await createBenchmarkPage(browser);
  await initialisePage(warmPage, warmSession, 1);
  for (let iteration = 1; iteration <= warmRuns; iteration += 1) {
    for (const benchmarkQuery of queries) {
      searches.push(await measureSearch(warmPage, warmSession, benchmarkQuery, "warm", iteration));
    }
  }
  await warmContext.close();

  writeResults(outputPath, {
    result_schema_version: 1,
    created_at: new Date().toISOString(),
    run_type: coldRuns >= 3 && warmRuns >= 10 ? "baseline" : "smoke",
    benchmark_phase: benchmarkPhase,
    dataset_key: datasetRole,
    dataset_role: datasetRole,
    database_path: process.env.BENCHMARK_DATABASE_PATH
      ? portableRepositoryPath(process.env.BENCHMARK_DATABASE_PATH)
      : "bundled demonstration database",
    query_manifest: portableRepositoryPath(queryManifestPath),
    configuration: { cold_runs: coldRuns, warm_runs: warmRuns, browser_cache_disabled: true },
    environment: browserEnvironment(browser),
    initialisation,
    searches,
  });
});
