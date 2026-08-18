# Issue 13 final benchmark comparison

Status: **formal final comparison**.

The committed Issue 14 baseline is compared with a fresh run of the final implementation. Positive deltas are slower/larger; changes above 20% require an explanation and mentor review.

## Environment

- Baseline commit: `3cf0de56627a6dc433047b61f67a06ad48db9143`
- Final commit: `230ff05bd1ce8a74f1f22ff98fd17e8324a522d6`
- Platform: `Windows-11-10.0.26200-SP0`
- Python: `3.13.14`
- CPU-frequency snapshot: baseline `3040.0 MHz`; final `3040.0 MHz`
- Node.js: `v26.4.0`
- Baseline browser: `151.0.4129.86`
- Final browser: `151.0.4129.86`

## Results

| Dataset | Metric | Baseline | Final | Change | Assessment |
|---|---|---:|---:|---:|---|
| small | Indexing time | 2.01 s | 2.03 s | +0.9% | within threshold |
| small | Peak indexing memory | 131.52 MiB | 127.88 MiB | -2.8% | within threshold |
| small | Database size | 17.70 MiB | 14.86 MiB | -16.0% | within threshold |
| small | Initial browser load p95 | 2539.9 ms | 2436.9 ms | -4.1% | within threshold |
| small | Initial bytes transferred p95 | 0.03 MiB | 0.03 MiB | +0.0% | within threshold |
| small | Visible search latency p95 | 127.7 ms | 125.4 ms | -1.8% | within threshold |
| small | Search bytes transferred p95 | 0.14 MiB | 0.10 MiB | -25.7% | within threshold |
| small | Browser JS heap p95 | 36.63 MiB | 42.03 MiB | +14.7% | within threshold |
| small | Main-thread long-task duration p95 | 0.0 ms | 0.0 ms | +0.0% | within threshold |
| medium | Indexing time | 10.28 s | 9.51 s | -7.5% | within threshold |
| medium | Peak indexing memory | 451.00 MiB | 401.31 MiB | -11.0% | within threshold |
| medium | Database size | 130.13 MiB | 109.50 MiB | -15.9% | within threshold |
| medium | Initial browser load p95 | 2425.6 ms | 2577.8 ms | +6.3% | within threshold |
| medium | Initial bytes transferred p95 | 0.03 MiB | 0.03 MiB | +0.0% | within threshold |
| medium | Visible search latency p95 | 229.5 ms | 240.7 ms | +4.9% | within threshold |
| medium | Search bytes transferred p95 | 2.02 MiB | 1.03 MiB | -48.9% | within threshold |
| medium | Browser JS heap p95 | 44.71 MiB | 41.90 MiB | -6.3% | within threshold |
| medium | Main-thread long-task duration p95 | 0.0 ms | 0.0 ms | +0.0% | within threshold |
| large | Indexing time | 152.69 s | 141.41 s | -7.4% | within threshold |
| large | Peak indexing memory | 1891.86 MiB | 1650.78 MiB | -12.7% | within threshold |
| large | Database size | 1253.91 MiB | 1038.68 MiB | -17.2% | within threshold |
| large | Initial browser load p95 | 2142.4 ms | 2191.1 ms | +2.3% | within threshold |
| large | Initial bytes transferred p95 | 0.03 MiB | 0.03 MiB | +0.0% | within threshold |
| large | Visible search latency p95 | 860.6 ms | 890.6 ms | +3.5% | within threshold |
| large | Search bytes transferred p95 | 12.04 MiB | 4.02 MiB | -66.6% | within threshold |
| large | Browser JS heap p95 | 36.32 MiB | 36.23 MiB | -0.3% | within threshold |
| large | Main-thread long-task duration p95 | 0.0 ms | 0.0 ms | +0.0% | within threshold |

## Unexpected or negative results

No measured metric regressed by more than 20%.

## Methodology and limitations

- Dataset identities, sizes and SHA-256 checksums are identical between runs.
- Indexer configuration, operating system, Python version and CPU topology are required to match.
- Browser runs use the same query manifest, Node version, three cold repetitions and ten warm repetitions.
- Browser patch versions may differ because the installed Edge/Chromium channel updates independently; both versions are recorded above.
- Results are single-machine observations and include normal operating-system, filesystem-cache and antivirus noise.
- Chromium JavaScript heap is not total browser RSS, and Long Tasks cover the page main thread rather than the SQLite worker.

## Acceptance check

- [x] Baseline and final datasets and configurations are directly comparable.
- [x] Indexing time, peak indexing memory and database size are compared.
- [x] Loading time, transferred bytes, search latency, browser memory and main-thread responsiveness are compared.
- [x] Regressions above 20% have evidence-based explanations.
