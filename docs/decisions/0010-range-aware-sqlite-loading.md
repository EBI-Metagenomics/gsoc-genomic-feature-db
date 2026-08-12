# Decision 0010: guarded SQLite HTTP range loading

- Status: accepted and implemented for Issue #10
- Decision date: 2026-08-12
- Last reviewed: 2026-08-13

## Context

Large genomic feature databases should be searchable without downloading the
complete file first. The existing `sqlite-wasm-http` VFS could issue byte-range
requests, but it did not sufficiently prove that a server returned the exact
requested range. A server could return `200 OK` with the complete database while
the application appeared to be lazy-loading.

## Decision

Keep and pin `sqlite-wasm-http` 1.2.0 for Issue #10, but validate and measure its
network requests in the database Worker. Do not build a custom VFS in this issue.

The implementation provides:

- strict validation of `206`, `Accept-Ranges`, `Content-Range`,
  `Content-Length`, response length, SQLite header, and page size;
- validation of every VFS `HEAD` and ranged GET, using `If-Range` when the host
  exposes a strong `ETag` or `Last-Modified` value;
- measured response-body bytes for initialization and searches;
- bounded retries for transient network failures;
- visible loading, diagnostics, retry, and failure states; and
- a clearly labelled, user-selected complete-download fallback. It is never
  silently presented as lazy loading.

## Database validation

`databaseSizeBytes` and `databaseSha256` are optional host-provided metadata.
When present, size is cross-checked and SHA-256 is verified during complete
download. A whole-file hash cannot verify range mode without downloading the
whole file.

The schema-version check remains required. `indexer.py` writes it automatically,
so no manual per-dataset version configuration is needed. Both loading modes
reject missing or incompatible schema metadata.

Complete-download fallback also validates the SQLite header, runs
`PRAGMA quick_check`, and enables `query_only` before search.

## Options considered

| Option                                    | Important trade-off                                                                                                                                                      | Licence    | Outcome              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | -------------------- |
| Guard `sqlite-wasm-http`                  | Smallest compatible change; retains FTS5 and the existing Worker. The package is experimental and its latest release remains 1.2.0 from December 2023.                   | ISC        | Selected and pinned. |
| `sql.js-httpvfs`                          | Requires a rewrite; its maintainer describes it as mainly a demonstration and documents no VFS tests or cache eviction.                                                  | Apache-2.0 | Rejected.            |
| `wa-sqlite` plus custom HTTP VFS          | Flexible and maintained, but does not include the required production-ready HTTP range VFS.                                                                              | MIT        | Future option.       |
| Official SQLite WASM plus custom HTTP VFS | Best long-term control, but the project would own the complete VFS, cache, retry, and cross-browser implementation. Its older Worker1/Promiser1 APIs are now deprecated. | Apache-2.0 | Future option.       |

Sources: [`sqlite-wasm-http`](https://github.com/mmomtchev/sqlite-wasm-http),
[`sql.js-httpvfs`](https://github.com/phiresky/sql.js-httpvfs#is-this-production-ready),
[`wa-sqlite`](https://github.com/rhashimoto/wa-sqlite), and
[official SQLite WASM](https://github.com/sqlite/sqlite-wasm#deprecations).

## Browser, server, and caching requirements

The selected synchronous backend runs inside a dedicated Worker and does not
require `SharedArrayBuffer` or cross-origin isolation. The repository configures
Playwright coverage for Chromium, Firefox, and WebKit.

The database host must provide:

- correct `GET`, `HEAD`, `206` byte ranges, and `416` for invalid ranges;
- browser-readable `Accept-Ranges`, `Content-Length`, and `Content-Range` headers;
- no content transformation or `Content-Encoding` on SQLite bytes;
- CORS permission for the application origin and `Range` request header; and
- immutable/versioned URLs. `ETag` or `Last-Modified` is recommended.

The VFS uses an approximately 4 MiB Worker cache, with the browser HTTP cache as
an additional layer. Reported bytes are response-body bytes received by the
application; they exclude HTTP/TLS overhead and may include cached responses.

## Verification evidence

The remote 18,558,976-byte demonstration database returned a correct 100-byte
`206` response. Browser tests verify the SQLite signature, bounded initialization,
measured search traffic, invalid-range rejection, interruption recovery, and the
explicit complete-download fallback.

The live [MGnify record for `MGYG000490722`](https://www.ebi.ac.uk/metagenomics/api/v2/genomes/MGYG000490722)
already returns URLs for FNA, FAI, FAA, and plain GFF files. A tested range request
to its EBI-hosted FNA returned `206` and the correct range headers. However, its
download sizes are currently `null` and it does not provide SHA-256, supporting
the decision to keep these component inputs optional.

The exact future EBI SQLite URL must still be tested because proxy, CORS, MIME,
compression, and cache settings can differ by file type. EBI integration must
also publish BGZF GFF plus TBI/CSI for JBrowse and add the SQLite artifact through
the automated pipeline/API flow rather than manual frontend entries.

## Consequences

The guarded VFS is suitable for the Issue #10 scope and trusted, read-only
datasets, but it remains coupled to an experimental pinned dependency. Any VFS
upgrade must rerun the range, interruption, byte-counting, fallback, and real
database tests. Migration to the current official SQLite WASM runtime with a
maintained or project-owned HTTP VFS remains future work.
