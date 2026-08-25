# Issue 13 final benchmark comparison

Status: **formal final comparison**.

The committed Issue 14 baseline is compared with a fresh run of the final implementation. Positive deltas are slower/larger; changes above 20% require an explanation and mentor review.

## Environment

- Baseline commit: `7ac4e389f2e2a9543fcc87e69e7c3ce298e35dab`
- Final commit: `3cf0de56627a6dc433047b61f67a06ad48db9143`
- Platform: `Windows-11-10.0.26200-SP0`
- Python: `3.13.14`
- CPU-frequency snapshot: baseline `3040.0 MHz`; final `3040.0 MHz`
- Node.js: `v26.4.0`
- Baseline browser: `151.0.4129.78`
- Final browser: `151.0.4129.86`

## Results

| Dataset | Metric | Baseline | Final | Change | Assessment |
|---|---|---:|---:|---:|---|
| small | Indexing time | 2.41 s | 2.01 s | -16.6% | within threshold |
| small | Peak indexing memory | 134.64 MiB | 131.52 MiB | -2.3% | within threshold |
| small | Database size | 17.70 MiB | 17.70 MiB | +0.0% | within threshold |
| small | Initial browser load p95 | 7929.8 ms | 2539.9 ms | -68.0% | within threshold |
| small | Initial bytes transferred p95 | 0.03 MiB | 0.03 MiB | +0.0% | within threshold |
| small | Visible search latency p95 | 127.9 ms | 127.7 ms | -0.1% | within threshold |
| small | Search bytes transferred p95 | 0.14 MiB | 0.14 MiB | +0.0% | within threshold |
| small | Browser JS heap p95 | 39.31 MiB | 36.63 MiB | -6.8% | within threshold |
| small | Main-thread long-task duration p95 | 0.0 ms | 0.0 ms | +0.0% | within threshold |
| medium | Indexing time | 12.85 s | 10.28 s | -20.0% | within threshold |
| medium | Peak indexing memory | 451.36 MiB | 451.00 MiB | -0.1% | within threshold |
| medium | Database size | 130.13 MiB | 130.13 MiB | +0.0% | within threshold |
| medium | Initial browser load p95 | 7949.6 ms | 2425.6 ms | -69.5% | within threshold |
| medium | Initial bytes transferred p95 | 0.03 MiB | 0.03 MiB | +0.0% | within threshold |
| medium | Visible search latency p95 | 228.9 ms | 229.5 ms | +0.3% | within threshold |
| medium | Search bytes transferred p95 | 2.02 MiB | 2.02 MiB | +0.0% | within threshold |
| medium | Browser JS heap p95 | 43.91 MiB | 44.71 MiB | +1.8% | within threshold |
| medium | Main-thread long-task duration p95 | 0.0 ms | 0.0 ms | +0.0% | within threshold |
| large | Indexing time | 186.58 s | 152.69 s | -18.2% | within threshold |
| large | Peak indexing memory | 1893.93 MiB | 1891.86 MiB | -0.1% | within threshold |
| large | Database size | 1253.91 MiB | 1253.91 MiB | +0.0% | within threshold |
| large | Initial browser load p95 | 7868.0 ms | 2142.4 ms | -72.8% | within threshold |
| large | Initial bytes transferred p95 | 0.03 MiB | 0.03 MiB | +0.0% | within threshold |
| large | Visible search latency p95 | 857.8 ms | 860.6 ms | +0.3% | within threshold |
| large | Search bytes transferred p95 | 12.04 MiB | 12.04 MiB | +0.0% | within threshold |
| large | Browser JS heap p95 | 37.44 MiB | 36.32 MiB | -3.0% | within threshold |
| large | Main-thread long-task duration p95 | 0.0 ms | 0.0 ms | +0.0% | within threshold |

## Unexpected or negative results

No measured metric regressed by more than 20%.
- An earlier final run on the same laptop, using a lower-power mode, reported a 2018 MHz CPU-frequency snapshot and broad timing regressions. Its generated files were intentionally discarded after this environmental effect was recorded. This repeat used a 3040 MHz snapshot matching baseline and is the authoritative Issue 13 comparison.

## Methodology and limitations

- Dataset identities, sizes and SHA-256 checksums are identical between runs.
- Indexer configuration, operating system, Python version and CPU topology are required to match.
- Browser runs use the same query manifest, Node version, three cold repetitions and ten warm repetitions.
- Browser patch versions may differ because the installed Edge/Chromium channel updates independently; both versions are recorded above.
- Results are single-machine observations and include normal operating-system, filesystem-cache and antivirus noise.
- Chromium JavaScript heap is not total browser RSS, and Long Tasks cover the page main thread rather than the SQLite worker.
- The large initial-load p95 improvements are reported but are not claimed as a product improvement: page readiness is sensitive to browser startup, cache state and the Edge patch version.
- One controlled baseline and one controlled final matrix do not provide confidence intervals; repeat the matrix on controlled hardware before making a release performance guarantee.

## Acceptance check

- [x] Baseline and final datasets and configurations are directly comparable.
- [x] Indexing time, peak indexing memory and database size are compared.
- [x] Loading time, transferred bytes, search latency, browser memory and main-thread responsiveness are compared.
- [x] Regressions above 20% have evidence-based explanations.
