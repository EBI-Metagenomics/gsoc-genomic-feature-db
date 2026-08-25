import { lstat, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(packageRoot);
const consumerRoot = join(repositoryRoot, "examples", "package-consumer");
const tarball = join(packageRoot, "package-artifacts", "genomic-feature-db-component-0.1.0.tgz");
const npmEnvironment = { ...process.env, npm_config_cache: join(packageRoot, ".npm-cache") };
const npmExecutable = process.env.npm_execpath;
const npm = npmExecutable ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";

function npmArgs(args) {
  return npmExecutable ? [npmExecutable, ...args] : args;
}

function run(command, args, cwd = consumerRoot, env = npmEnvironment) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [join(packageRoot, "scripts", "pack-local.mjs")], packageRoot);
for (const generated of ["node_modules", "dist", "test-results", "playwright-report"]) {
  await rm(join(consumerRoot, generated), { recursive: true, force: true });
}

run(npm, npmArgs(["ci"]));
run(npm, npmArgs(["install", "--no-save", "--package-lock=false", tarball]));

const installedRoot = join(consumerRoot, "node_modules", "genomic-feature-db-component");
if ((await lstat(installedRoot)).isSymbolicLink()) {
  throw new Error("Consumer must install the tarball, not a linked repository package");
}
const installedManifest = JSON.parse(await readFile(join(installedRoot, "package.json"), "utf8"));
if (
  installedManifest.private !== true ||
  installedManifest.name !== "genomic-feature-db-component"
) {
  throw new Error("Installed package lost its temporary private package metadata");
}

const reactTree = spawnSync(npm, npmArgs(["ls", "react", "--all", "--parseable"]), {
  cwd: consumerRoot,
  encoding: "utf8",
});
if (reactTree.status !== 0) {
  process.stdout.write(reactTree.stdout ?? "");
  process.stderr.write(reactTree.stderr ?? "");
  process.exit(reactTree.status ?? 1);
}
const reactInstallations = new Set(
  reactTree.stdout
    .split(/\r?\n/)
    .filter((path) => /[\\/]node_modules[\\/]react$/.test(path.trim()))
    .map((path) => path.trim()),
);
if (reactInstallations.size !== 1) {
  throw new Error(`Expected one React installation, found ${reactInstallations.size}`);
}

run(npm, npmArgs(["run", "typecheck"]));
run(npm, npmArgs(["run", "build"]));
run(npm, npmArgs(["exec", "--", "playwright", "test"]));
run(npm, npmArgs(["exec", "--", "playwright", "test"]), consumerRoot, {
  ...npmEnvironment,
  PACKAGE_CONSUMER_PREVIEW: "1",
});
