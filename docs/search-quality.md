# Search Semantics, Quality, and Performance

This document is the authoritative description of production search behaviour.
The fixed quality corpus is the bundled `MGYG000490722` demonstration database
(`sample_data/MGYG000490722/MGYG000490722.db.zip`). Despite its delivery suffix,
the file contains raw SQLite bytes and is opened read-only by the quality tests.

## Search semantics

- Queries shorter than three trimmed characters do not touch the database.
- Input is tokenized case-insensitively with SQLite FTS5 `unicode61`.
- `_` and `.` are token characters, so accessions such as
  `MGYG000490722_00001` and values such as `3.2.1.22` stay intact.
- Other punctuation becomes a separator. `Ski3/TTC37` therefore has the same
  meaning as `Ski3 TTC37`.
- Every ordinary term is a prefix. Multiple terms are combined with implicit
  AND, so every term must occur somewhere in the indexed row.
- Namespace-style input keeps the namespace exact and prefixes the final value:
  `pfam:PF16499` becomes `"pfam" "PF16499"*`.
- Production searches `feature_id`, `name`, `biotype`, `description`, and
  `annotations` together. Column scoping remains an internal, allow-listed
  capability used for verification; there is no production field selector.

A complete identifier is still a prefix query. For example,
`MGYG000490722_00001` intentionally returns the gene and its related transcript,
CDS, intron, and codon feature identifiers that share the token prefix. Search
does not switch to strict equality when an identifier looks complete.

## Fixed quality matrix

The shared fixture at `ui-component/src/test/search-quality-cases.json` freezes
the MATCH expression, result count, and stable rowids for representative cases.
Python tests execute those expressions against the real database; Vitest checks
that the browser query builder produces the same expressions.

| Case | Query | Expected matches |
|---|---|---:|
| Complete identifier | `MGYG000490722_00001` | 9 |
| Feature name (name column) | `MGYG000490722_1.tRNA1-SerTGA` | 1 |
| Description keyword | `DapA-like` | 9 |
| Pfam annotation | `pfam:PF16499` | 19 |
| InterPro annotation | `interpro:IPR002241` | 20 |
| Identifier prefix | `MGYG000490722_000` | 1,157 |
| Multiple terms | `Ski3 TTC37` | 4 |
| Punctuation equivalent | `Ski3/TTC37` | 4 |
| Period-containing EC value | `ec_number:3.2.1.22` | 37 |
| No result | `zzzx_no_such_feature_987` | 0 |
| High-frequency term | `protein` | 22,579 |
| All fields | `PF16499` | 19 |
| Description only | `PF16499` | 0 |

The two broad cases freeze their first two 25-row pages as well as their full
local count. Tests compute counts locally for verification only; production does
not run an additional global count query over HTTP VFS.

## Ordering, pagination, and counts

Results use ascending SQLite `rowid`, which is deterministic ingestion order,
not relevance order. Each query fetches 26 rows, returns at most 25, and uses the
lookahead row only to decide whether another page exists. The next page continues
after the last returned rowid, avoiding offset scans and arbitrary result caps.

The UI reports rows **loaded**, never a global total. When a lookahead row exists,
it says that more results are available. Feature-type facets likewise describe
only the rows currently loaded in the browser.

## Why production does not use BM25

BM25 was intentionally removed from the production query. A relevance-sorted
query has to score and sort the complete matching set before applying its limit,
which is expensive when SQLite pages arrive through HTTP Range requests.

Historical Drosophila browser measurements illustrate the trade-off:

| Query | BM25 bytes / requests / time | Rowid bytes / requests / time |
|---|---:|---:|
| `FBgn` | 9.65 MiB / 47 / 2,242 ms | 64.3 KiB / 1 / 2,532 ms |
| `kinase` | 1.02 MiB / 187 / 2,898 ms | 106.6 KiB / 9 / 2,154 ms |
| `GeneID:43904` | 2.02 MiB / 14 / 2,233 ms | 2.02 MiB / 14 / 2,154 ms |

The bandwidth and request reduction is material for broad searches, while wall
clock improvement depends on cache and query selectivity. No quality evaluation
has demonstrated that default, unweighted BM25 produces more useful genomic
results. Relevance ranking should only return if user research defines useful
ranking rules and shows that their benefit outweighs the remote-query cost.

The current schema retains `columnsize=1`, but production ordering does not use
its BM25 length statistics. Testing `detail=column, columnsize=0` in isolation is
a separate database-size optimization; it is not part of this search-quality
change because existing comparisons changed both settings together.

## Performance target and responsiveness

The agreed browser target is under 3,000 ms from submission to a visible first
page for cold and warm selective searches and for the `protein` broad search on
the bundled demonstration. `e2e/search-performance.spec.ts` checks this target;
it is an environment-sensitive local/release check rather than a merge gate.

SQLite and HTTP VFS work run in a Web Worker, so synchronous database operations
do not run on the React main thread. Live input is debounced by 200 ms, concurrent
Load More requests are rejected, and stale responses from rapid typing cannot
replace the newest result set. The displayed elapsed value is accumulated worker
query time for loaded pages, not a global count or a complete network benchmark.

## Known limitations

- No strict exact-match mode; complete identifiers retain prefix semantics.
- No phrase, fuzzy, stemming, or user-authored boolean-query mode.
- No relevance ranking; results follow stable ingestion order.
- No production field selector, despite internal column-scoped support.
- No global match total in the UI; counts refer to loaded rows.
- Indexed annotation values are subject to the indexer's per-tag and length caps.
- Performance depends on hosting, Range-request support, browser cache state, and
  the selected database.
