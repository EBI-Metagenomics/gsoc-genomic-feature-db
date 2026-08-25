# Three-way FTS configuration benchmark comparison

Status: **comparative evidence**.

This report compares the three canonical benchmark configurations using the
same small, medium and large datasets:

| Label | FTS configuration | Source result |
|---|---|---|
| `column/1` | `detail=column`, `columnsize=1` | `final-report-performance.md` |
| `none/0` | `detail=none`, `columnsize=0` | `final-report-none0-rerun-vs-column1.md` |
| `column/0` | `detail=column`, `columnsize=0` | `final-report-column0-vs-column1.md` and `final-report-column0-vs-none0.md` |

## Executive conclusion

For the current UI, `detail=none` and `columnsize=0` remains the best
configuration. It produces the smallest databases and the lowest search
transfer volume, while search latency remains close to the other two setups.

`column/0` is a reasonable compatibility compromise if column-aware FTS
behavior may be needed later, but it gives up a substantial part of the size
and transfer savings while not providing a meaningful latency improvement in
these runs.

## Indexer comparison

Values are external wall time, peak process-tree RSS and database size.

| Dataset | Metric | `column/1` | `none/0` | `column/0` |
|---|---|---:|---:|---:|
| small | Indexing time | 2.01 s | 2.03 s | **1.93 s** |
| small | Peak RSS | 131.52 MiB | **127.88 MiB** | 148.31 MiB |
| small | Database size | 17.70 MiB | **14.86 MiB** | 15.91 MiB |
| medium | Indexing time | 10.28 s | **9.51 s** | 10.08 s |
| medium | Peak RSS | 451.00 MiB | **401.31 MiB** | 439.13 MiB |
| medium | Database size | 130.13 MiB | **109.50 MiB** | 124.58 MiB |
| large | Indexing time | 152.69 s | **141.41 s** | 149.28 s |
| large | Peak RSS | 1891.86 MiB | **1650.78 MiB** | 1765.18 MiB |
| large | Database size | 1253.91 MiB | **1038.68 MiB** | 1139.92 MiB |

Across all three databases, total size is:

| Setup | Total size | Difference from `column/1` |
|---|---:|---:|
| `column/1` | 1401.74 MiB | — |
| `column/0` | 1280.41 MiB | 8.7% smaller |
| `none/0` | **1163.04 MiB** | **17.0% smaller** |

`column/0` isolates much of the `columnsize` savings, but `none/0` is still
9.2% smaller than `column/0` overall.

## Browser comparison

Values are p95 measurements from three cold repetitions and ten warm
repetitions.

| Dataset | Metric | `column/1` | `none/0` | `column/0` |
|---|---|---:|---:|---:|
| small | Initial page-ready p95 | 2539.9 ms | **2436.9 ms** | 7075.2 ms |
| small | Visible search p95 | 127.7 ms | 125.4 ms | **122.2 ms** |
| small | Search bytes p95 | 0.14 MiB | **0.10 MiB** | 0.14 MiB |
| small | JS heap p95 | 36.63 MiB | 42.03 MiB | **42.09 MiB** |
| medium | Initial page-ready p95 | 2425.6 ms | 2577.8 ms | 7001.5 ms |
| medium | Visible search p95 | 229.5 ms | 240.7 ms | **227.1 ms** |
| medium | Search bytes p95 | 2.02 MiB | **1.03 MiB** | 2.03 MiB |
| medium | JS heap p95 | 44.71 MiB | **41.90 MiB** | 46.55 MiB |
| large | Initial page-ready p95 | 2142.4 ms | 2191.1 ms | 7322.5 ms |
| large | Visible search p95 | 860.6 ms | 890.6 ms | **866.5 ms** |
| large | Search bytes p95 | 12.04 MiB | **4.02 MiB** | 12.04 MiB |
| large | JS heap p95 | 36.32 MiB | **36.23 MiB** | 36.89 MiB |

The search-byte pattern is important: `none/0` reduces transfer substantially,
while `column/0` is almost identical to `column/1`. This indicates that the
lower search traffic is primarily associated with `detail=none`, not merely
with `columnsize=0`.

## Initial page-load p95 correction

The original `none/0` browser run was performed while the laptop had been
running for more than 10 hours. It produced page-ready p95 values of 7050.6 ms,
7384.1 ms and 6810.9 ms for small, medium and large respectively.

After restarting the laptop, the `none/0` rerun produced:

| Dataset | Original `none/0` | Restarted `none/0` | Change |
|---|---:|---:|---:|
| small | 7050.6 ms | **2436.9 ms** | -65.4% |
| medium | 7384.1 ms | **2577.8 ms** | -65.1% |
| large | 6810.9 ms | **2191.1 ms** | -67.8% |

The restarted values are close to the `column/1` results of 2539.9 ms,
2425.6 ms and 2142.4 ms. This confirms that the earlier initial-load delay was
an environmental cold-start effect associated with the laptop's long uptime,
not a `detail=none` or `columnsize=0` regression.

The rerun also kept the important database results: 16.0–17.2% smaller output,
lower search transfer and similar visible search latency. The `column/0`
browser run was made before the restart, so its initial page-ready p95 should
also be treated as uptime-contaminated; its indexer and search results remain
useful for the configuration comparison.

## Recommendation

Keep `detail=none` and `columnsize=0` for the current product requirements.

Use `column/0` only if the project specifically wants to preserve column-aware
FTS behavior while accepting a larger database and higher search transfer.

## Source files

- `final-report-performance.md` — `column/1`
- `final-report-none0-rerun-vs-column1.md` — restarted `none/0`
- `final-report-column0-vs-column1.md` — `column/0` versus `column/1`
- `final-report-column0-vs-none0.md` — `column/0` versus `none/0`
