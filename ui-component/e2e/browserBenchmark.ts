import { expect, type Browser, type CDPSession, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export interface BenchmarkQuery {
  category: string;
  query: string;
}

interface Diagnostics {
  bytes: number;
  requests: number;
}

interface MemorySample {
  js_heap_used_bytes: number | null;
  js_heap_total_bytes: number | null;
}

export interface InitialisationSample extends Diagnostics, MemorySample {
  iteration: number;
  page_ready_ms: number;
  worker_initialisation_ms: number;
  long_task_count: number;
  long_task_duration_ms: number;
}

export interface SearchSample extends Diagnostics, MemorySample {
  cache_state: "cold" | "warm";
  iteration: number;
  category: string;
  query: string;
  results_loaded: number;
  worker_query_ms: number;
  visible_results_ms: number;
  long_task_count: number;
  long_task_duration_ms: number;
}

interface LongTaskSnapshot {
  count: number;
  duration: number;
}

const e2eDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(e2eDirectory, "../..");

export function portableRepositoryPath(value: string): string {
  const absolutePath = resolve(value);
  const repositoryRelative = relative(repositoryRoot, absolutePath);
  if (
    repositoryRelative !== ".." &&
    !repositoryRelative.startsWith(`..${sep}`) &&
    !isAbsolute(repositoryRelative)
  ) {
    return repositoryRelative.split(sep).join("/") || ".";
  }
  return absolutePath.split(sep).join("/");
}

async function installLongTaskObserver(page: Page): Promise<void> {
  await page.addInitScript({
    content: `
      (() => {
        const state = { count: 0, duration: 0 };
        Object.defineProperty(globalThis, "__benchmarkLongTasks", {
          value: state,
          configurable: false,
          writable: false,
        });
        if (typeof PerformanceObserver === "undefined") return;
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              state.count += 1;
              state.duration += entry.duration;
            }
          });
          observer.observe({ type: "longtask", buffered: true });
        } catch {}
      })();
    `,
  });
}

async function longTasks(page: Page): Promise<LongTaskSnapshot> {
  return page.evaluate<LongTaskSnapshot>(
    "globalThis.__benchmarkLongTasks ?? { count: 0, duration: 0 }",
  );
}

async function memorySample(session: CDPSession): Promise<MemorySample> {
  try {
    await session.send("Performance.enable");
    const result = await session.send("Performance.getMetrics");
    const metrics = new Map(result.metrics.map((metric) => [metric.name, metric.value]));
    return {
      js_heap_used_bytes: metrics.get("JSHeapUsedSize") ?? null,
      js_heap_total_bytes: metrics.get("JSHeapTotalSize") ?? null,
    };
  } catch {
    return { js_heap_used_bytes: null, js_heap_total_bytes: null };
  }
}

async function diagnostics(page: Page): Promise<Diagnostics> {
  const operation = page.getByTestId("database-operation-bytes");
  return {
    bytes: Number((await operation.getAttribute("data-bytes")) ?? 0),
    requests: Number((await operation.getAttribute("data-requests")) ?? 0),
  };
}

export async function initialisePage(
  page: Page,
  session: CDPSession,
  iteration: number,
): Promise<InitialisationSample> {
  const started = performance.now();
  await page.goto("/");
  const input = page.getByRole("searchbox", { name: "Search genomic features" });
  await expect(input).toBeEnabled();
  const pageReadyMs = performance.now() - started;
  const workerElement = page.getByTestId("database-initialization-time");
  const workerInitialisationMs = Number(
    (await workerElement.getAttribute("data-milliseconds")) ?? 0,
  );
  const transfer = await diagnostics(page);
  const taskSnapshot = await longTasks(page);
  return {
    iteration,
    page_ready_ms: pageReadyMs,
    worker_initialisation_ms: workerInitialisationMs,
    bytes: transfer.bytes,
    requests: transfer.requests,
    long_task_count: taskSnapshot.count,
    long_task_duration_ms: taskSnapshot.duration,
    ...(await memorySample(session)),
  };
}

async function clearResults(page: Page): Promise<void> {
  const input = page.getByRole("searchbox", { name: "Search genomic features" });
  await input.fill("");
  await expect(page.locator("tbody tr")).toHaveCount(0);
}

export async function measureSearch(
  page: Page,
  session: CDPSession,
  benchmarkQuery: BenchmarkQuery,
  cacheState: "cold" | "warm",
  iteration: number,
): Promise<SearchSample> {
  await clearResults(page);
  const input = page.getByRole("searchbox", { name: "Search genomic features" });
  await input.fill(benchmarkQuery.query);
  const beforeTasks = await longTasks(page);
  const started = performance.now();
  await input.press("Enter");
  await expect(page.locator("tbody tr").first()).toBeVisible();
  const visibleResultsMs = performance.now() - started;
  const meta = page.locator(".cvf-search-meta");
  await expect(meta).toBeVisible();
  const metaText = await meta.innerText();
  const match = metaText.match(/^(\d+) results? loaded in ([\d.]+) ms\./);
  if (!match) throw new Error(`Cannot parse search timing from: ${metaText}`);
  const afterTasks = await longTasks(page);
  const transfer = await diagnostics(page);
  return {
    cache_state: cacheState,
    iteration,
    category: benchmarkQuery.category,
    query: benchmarkQuery.query,
    results_loaded: Number(match[1]),
    worker_query_ms: Number(match[2]),
    visible_results_ms: visibleResultsMs,
    bytes: transfer.bytes,
    requests: transfer.requests,
    long_task_count: afterTasks.count - beforeTasks.count,
    long_task_duration_ms: afterTasks.duration - beforeTasks.duration,
    ...(await memorySample(session)),
  };
}

export function gitCommit(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
}

export function writeResults(outputPath: string, value: unknown): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, outputPath);
  rmSync(temporary, { force: true });
}

export async function createBenchmarkPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installLongTaskObserver(page);
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  return { context, page, session };
}

export function browserEnvironment(browser: Browser) {
  const packageLock = JSON.parse(
    readFileSync(resolve(repositoryRoot, "ui-component/package-lock.json"), "utf8"),
  ) as { packages?: Record<string, { version?: string }> };
  const packageVersion = (name: string) =>
    packageLock.packages?.[`node_modules/${name}`]?.version ?? null;
  const npmVersion = (() => {
    const userAgentVersion = process.env.npm_config_user_agent?.match(/\bnpm\/([^\s]+)/)?.[1];
    if (userAgentVersion) return userAgentVersion;
    try {
      return execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["--version"], {
        encoding: "utf8",
      }).trim();
    } catch {
      return null;
    }
  })();

  return {
    platform: `${os.platform()} ${os.release()}`,
    architecture: os.arch(),
    logical_cpu_count: os.cpus().length,
    cpu_model: os.cpus()[0]?.model ?? null,
    total_memory_bytes: os.totalmem(),
    node_version: process.version,
    npm_version: npmVersion,
    playwright_version: packageVersion("@playwright/test"),
    sqlite_wasm_version: packageVersion("@sqlite.org/sqlite-wasm"),
    sqlite_wasm_http_version: packageVersion("sqlite-wasm-http"),
    vite_version: packageVersion("vite"),
    browser_name: browser.browserType().name(),
    browser_version: browser.version(),
    git_commit: gitCommit(),
  };
}
