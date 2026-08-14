import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distribution = join(packageRoot, "dist");
const entryPath = join(distribution, "index.js");
const bundledAssets = join(distribution, "assets");
const packagedWasm = join(bundledAssets, "sqlite3.wasm");
const dependencyWasm = join(
  packageRoot,
  "node_modules",
  "sqlite-wasm-http",
  "deps",
  "dist",
  "sqlite3.wasm",
);

const entry = await readFile(entryPath, "utf8");
const bundledWorkerUrl =
  /new URL\(""\+new URL\("assets\/db\.worker-[^"]+\.js",import\.meta\.url\)\.href,import\.meta\.url\)/;
const matches = entry.match(new RegExp(bundledWorkerUrl.source, "g")) ?? [];
if (matches.length !== 1) {
  throw new Error(`Expected one bundled database worker URL, found ${matches.length}`);
}

const workerModuleUrl = 'new URL("./worker/workers/db.worker.js",import.meta.url)';
await writeFile(entryPath, entry.replace(bundledWorkerUrl, workerModuleUrl), "utf8");

// The consumer bundles the ESM worker graph and its sqlite-wasm-http dependency.
// Keep a WASM artifact in the tarball as an auditable copy of that exact runtime.
await rm(bundledAssets, { recursive: true, force: true });
await mkdir(bundledAssets, { recursive: true });
await copyFile(dependencyWasm, packagedWasm);
