import { rm, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const artifactDirectory = join(packageRoot, "package-artifacts");
const npmCache = join(packageRoot, ".npm-cache");
const npmExecutable = process.env.npm_execpath;
const npm = npmExecutable ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";

function run(args, options = {}) {
  const result = spawnSync(npm, npmExecutable ? [npmExecutable, ...args] : args, {
    cwd: packageRoot,
    env: { ...process.env, npm_config_cache: npmCache },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
  return result;
}

await rm(artifactDirectory, { recursive: true, force: true });
await mkdir(artifactDirectory, { recursive: true });
run(["run", "build:lib"], { stdio: "inherit" });

const packed = run(["pack", "--pack-destination", artifactDirectory, "--json"]);
const [manifest] = JSON.parse(packed.stdout);
const paths = manifest.files.map((file) => file.path.replaceAll("\\", "/"));
const requiredFiles = [
  "package.json",
  "README.md",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/styles.css",
];

for (const path of requiredFiles) {
  if (!paths.includes(path)) throw new Error(`Packed artifact is missing ${path}`);
}
if (!paths.includes("dist/worker/workers/db.worker.js")) {
  throw new Error("Packed artifact is missing the database worker");
}
if (!paths.some((path) => /^dist\/assets\/.*\.wasm$/.test(path))) {
  throw new Error("Packed artifact is missing SQLite WASM");
}

const forbidden = paths.filter(
  (path) =>
    /(^|\/)(src|dev|e2e|sample_data|test-results|playwright-report)(\/|$)/.test(path) ||
    /(?:^|\/)\w+\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path),
);
if (forbidden.length > 0) {
  throw new Error(`Packed artifact contains development files: ${forbidden.join(", ")}`);
}

process.stderr.write(packed.stderr ?? "");
console.log(join(artifactDirectory, manifest.filename));
console.log(`${paths.length} runtime/package files, ${manifest.size} packed bytes`);
