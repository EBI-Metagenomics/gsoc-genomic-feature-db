# Issue #14 reproducible performance benchmarks

This directory contains the reproducibility contract for profiling the current
GFF-to-SQLite indexer and browser search. Formal runs use the production schema,
rowid keyset pagination, and three canonical inputs:

| Role | Dataset | Compressed GFF | Uncompressed GFF |
|---|---|---:|---:|
| Small | MGnify `MGYG000490722` | 2,647,569 bytes | 25,425,052 bytes |
| Medium | Drosophila `GCF_000001215.4` | 8,688,226 bytes | 164,988,613 bytes |
| Large | GENCODE v49 GRCh38 | 123,771,820 bytes | 3,477,564,032 bytes |

The large input exceeds 100 MB even while compressed. Source URLs, exact
SHA-256 values and ignored local paths are versioned in `datasets.json`.

## Historical evidence

The existing Drosophila and NCBI GRCh38 Markdown reports in this directory are
historical optimization evidence. They established the benefit of rowid keyset
pagination for broad queries and compared paired FTS configurations. Most used
one manual repetition and changed schema/query variables, so they are not mixed
into the formal Issue #14 baseline. See
`detail-none-vs-column-controlled-benchmark.md` for the consolidated findings.

## Environment setup

From the repository root:

```powershell
.venv\Scripts\python.exe -m pip install -r benchmark\requirements.txt
cd ui-component
npm.cmd ci
cd ..
```

`psutil` is benchmark-only and is not imported by the production indexer.
On Windows, Playwright uses an installed Microsoft Edge/Chromium channel by
default. On other platforms, run `npx playwright install chromium` when a
compatible Chromium executable is not already available.

## Prepare and validate datasets

Existing repository fixtures are used when available. Missing datasets can be
downloaded into the ignored `benchmark-data/` directory.

```powershell
# Validate all exact sizes, decompressed sizes and checksums.
.venv\Scripts\python.exe benchmark\prepare_datasets.py

# Download missing inputs, then validate them.
.venv\Scripts\python.exe benchmark\prepare_datasets.py --download

# Fast checksum validation without fully decompressing 3.48 GB.
.venv\Scripts\python.exe benchmark\prepare_datasets.py --no-uncompressed-check
```

Selectors may be roles or dataset IDs, for example `--datasets small medium`.

## Profile indexing

Each dataset is indexed in a fresh subprocess. The runner samples peak resident
memory for the indexer and its child processes, records external monotonic wall
time, and combines those measurements with the indexer's structured audit.

```powershell
# Fast, explicitly non-baseline smoke run.
.venv\Scripts\python.exe benchmark\profile_indexer.py `
  --datasets small `
  --limit 1000 `
  --no-vacuum `
  --output benchmark\results\indexer-smoke.json

# Formal small/medium/large run.
.venv\Scripts\python.exe benchmark\profile_indexer.py `
  --datasets small medium large `
  --output benchmark\results\indexer-baseline.json
```

Generated databases and diagnostic logs are placed under ignored
`benchmark-work/`. Results are written after every completed dataset so a long
run retains earlier evidence if a later input fails. Paths inside the repository
are recorded as portable, forward-slash relative paths so formal result JSON can
be reviewed and committed without exposing a contributor's workspace path.

### Benchmark any local GFF3 file

An arbitrary local `.gff`, `.gff3`, `.gff.gz` or `.gff3.gz` file does not need a
manifest entry. The profiler calculates its SHA-256, compressed and
uncompressed sizes, source distributions and sequence count automatically:

```powershell
.venv\Scripts\python.exe benchmark\profile_indexer.py `
  --input C:\data\my-annotations.gff3.gz `
  --dataset-id my-dataset `
  --output benchmark\results\indexer-my-dataset.json
```

`--dataset-id` defaults to the input filename without its GFF suffix. It may
contain letters, numbers, dots, underscores and hyphens. With the default work
directory, the generated database is
`benchmark-work/my-dataset/my-dataset.db.zip`. `--limit`, `--no-vacuum`,
`--prefix`, `--sample-interval` and `--work-dir` work in both manifest and local
input modes. `--limit` or `--no-vacuum` labels the result as a smoke run.

The indexer can also be measured directly:

```powershell
.venv\Scripts\python.exe scripts\indexer.py input.gff.gz `
  --output output.db.zip `
  --stats-json indexer-stats.json
```

Omitting `--stats-json` preserves the normal CLI behavior.

## Profile the browser

The browser benchmark is opt-in and excluded from `npm run test:e2e`. It uses
Chromium, writes JSON rather than relying on pass/fail timing assertions, and
records:

- worker database initialization and page-to-ready time;
- worker query and submission-to-visible-results latency;
- database HTTP Range bytes and request counts;
- cold contexts and warm reused-worker/VFS runs;
- main-thread long-task counts/duration;
- Chromium JavaScript heap metrics where supported.

Formal methodology is at least three isolated cold runs and ten warm runs. The
query matrix is versioned in `browser-queries.json`.

Run the small bundled database:

```powershell
cd ui-component
$env:BENCHMARK_BROWSER_DATASET = "small"
$env:BENCHMARK_BROWSER_OUTPUT = "..\benchmark\results\browser-small.json"
npm.cmd run benchmark:browser
```

Run a generated medium or large database by setting its absolute or
repository-relative path:

```powershell
cd ui-component
$env:BENCHMARK_DATABASE_PATH = "..\benchmark-work\medium\GCF_000001215.4.db.zip"
$env:BENCHMARK_BROWSER_DATASET = "medium"
$env:BENCHMARK_BROWSER_OUTPUT = "..\benchmark\results\browser-medium.json"
npm.cmd run benchmark:browser
```

For a quick harness check, set `BENCHMARK_COLD_RUNS=1` and
`BENCHMARK_WARM_RUNS=1`; the output is automatically labeled `smoke`.

### Profile a custom database in the browser

Save a query manifest such as `benchmark/output/my-queries.json`. The dataset
key must match `BENCHMARK_BROWSER_DATASET`, and every query must return at least
one result:

```json
{
  "schema_version": 1,
  "datasets": {
    "my-dataset": [
      { "category": "exact_identifier", "query": "gene-123" },
      { "category": "broad_keyword", "query": "kinase" }
    ]
  }
}
```

Then run the existing browser benchmark against the generated database:

```powershell
cd ui-component
$env:BENCHMARK_DATABASE_PATH = "..\benchmark-work\my-dataset\my-dataset.db.zip"
$env:BENCHMARK_BROWSER_DATASET = "my-dataset"
$env:BENCHMARK_QUERY_MANIFEST = "..\benchmark\output\my-queries.json"
$env:BENCHMARK_BROWSER_OUTPUT = "..\benchmark\results\browser-my-dataset.json"
npm.cmd run benchmark:browser
```

Unset `BENCHMARK_QUERY_MANIFEST` to return to the canonical
`benchmark/browser-queries.json`. The generated result records the resolved
query-manifest path and dataset key.

## Generate the report

```powershell
.venv\Scripts\python.exe benchmark\generate_report.py `
  --indexer-results benchmark\results\indexer-baseline.json `
  --browser-results benchmark\results\browser-small.json `
  --browser-results benchmark\results\browser-medium.json `
  --browser-results benchmark\results\browser-large.json `
  --output benchmark\baseline-report.md
```

Commit the compact baseline JSON and generated report. Do not commit source
GFFs, generated SQLite databases, logs, Playwright traces, screenshots or videos.

For one custom dataset, pass its indexer and browser JSON to the same generator.
It automatically uses a generic report title and does not claim Issue #14's
three-dataset acceptance criteria:

```powershell
.venv\Scripts\python.exe benchmark\generate_report.py `
  --indexer-results benchmark\results\indexer-my-dataset.json `
  --browser-results benchmark\results\browser-my-dataset.json `
  --output benchmark\output\my-dataset-report.md
```

## Verification

Benchmark-focused checks:

```powershell
.venv\Scripts\python.exe -m pytest tests\test_benchmark.py tests\test_indexer.py
cd ui-component
npm.cmd run typecheck
npm.cmd run lint
$env:BENCHMARK_COLD_RUNS = "1"
$env:BENCHMARK_WARM_RUNS = "1"
npm.cmd run benchmark:browser
```

Before publishing a baseline, also run the normal Python, Vitest, build and E2E
suites. Full large-data profiling is deliberately manual and never part of
ordinary pull-request CI.
