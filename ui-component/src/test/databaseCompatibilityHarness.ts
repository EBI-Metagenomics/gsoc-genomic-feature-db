import * as Comlink from "comlink";

import type { DatabaseInitResult, SearchPageResult, WorkerApi } from "../workers/db.worker";
import type { DatabaseIntegrity } from "../workers/databaseTransport";

export interface CompatibilityResult {
  initialisation: DatabaseInitResult;
  searches: SearchPageResult[];
}

/** Browser-only test harness for generated databases which are not part of the demo registry. */
export async function testGeneratedDatabase(
  databaseUrl: string,
  integrity: DatabaseIntegrity,
  queries: string[],
  mode: "range" | "full-download" = "range",
): Promise<CompatibilityResult> {
  const rawWorker = new Worker(new URL("../workers/db.worker.ts", import.meta.url), {
    type: "module",
  });
  const proxy = Comlink.wrap<WorkerApi>(rawWorker);
  try {
    const initialisation = await proxy.initFromUrl(databaseUrl, { ...integrity, mode });
    const searches = [];
    for (const query of queries) searches.push(await proxy.searchPage(query));
    return { initialisation, searches };
  } finally {
    proxy[Comlink.releaseProxy]();
    rawWorker.terminate();
  }
}
