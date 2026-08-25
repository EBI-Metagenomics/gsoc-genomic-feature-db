# Search benchmark summary

## Main findings

- Broad BM25 searches scored and sorted the complete matching set before the
  limit; rowid keyset pagination can stop after each 25-row page.
- Manual Drosophila reports show much lower database traffic for broad searches
  after switching to rowid pagination.
- The none/0 build was **15.9% smaller** for Drosophila and **17.7% smaller** for
  human GRCh38. This was its only consistent demonstrated benefit.
- Automated checks on both 4,744,062-row databases used 31 warm first-page and
  15 warm 200-row samples; all eight queries had exact result parity.

## Manual browser observations

### Database size

| Dataset | none/0 | column/1 | Reduction |
|---|---:|---:|---:|
| Drosophila | 109.50 MiB | 130.13 MiB | 15.9% |
| Human GRCh38 | 1,242.87 MiB | 1,510.19 MiB | 17.7% |

### Drosophila: BM25 versus rowid pagination

Both used the 130.13 MiB database with browser cache enabled.

| Query | BM25: bytes / requests / time | Rowid: bytes / requests / time |
|---|---:|---:|
| `FBgn` | 9.65 MiB / 47 / 2,242 ms | 64.3 KiB / 1 / 2,532 ms |
| `kinase` | 1.02 MiB / 187 / 2,898 ms | 106.6 KiB / 9 / 2,154 ms |
| `GeneID:43904` | 2.02 MiB / 14 / 2,233 ms | 2.02 MiB / 14 / 2,154 ms |

### Human GRCh38: FTS detail configurations

| Query | none/0: bytes / requests / time | column/1: bytes / requests / time |
|---|---:|---:|
| `GeneID:54998` | 114.2 KiB / 21 / 2,147 ms | 114.4 KiB / 22 / 2,172 ms |
| `MIM:609183` | 29.8 KiB / 6 / 2,071 ms | 34.3 KiB / 8 / 2,088 ms |
| `GenBank:NM_001291345.2` | 30.1 KiB / 7 / 2,063 ms | 30.1 KiB / 7 / 2,077 ms |

These rows show no material latency difference. Similar `GeneID:54998` traffic
confirms that exact namespace handling, not `detail`, fixed its earlier large
prefix transfer.

## Warm-cache interpretation

The warm `kinase` runs were deliberate production-like tests: returning users
normally reuse browser and VFS pages. A later `0 KiB` run demonstrates successful
reuse, not a cold-search cost. Cold runs represent first visits; warm runs
represent returning users. Since cache state accumulates, warm rows should not
prove universal schema speed. Repeated local testing also found broad `kinase`
slower with none/0 (17.14 ms versus 7.41 ms for the first page).

## Decision

The current UI does not need field-specific search, so none/0 matches present
requirements and was 15.9% smaller for Drosophila and 17.7% smaller for human.
Retain `detail=column` only for possible future filtering: restricting `kinase`
to `Annotations` reduced 251,342 matches to 15 locally. The builds changed both
`detail` and `columnsize`, so their individual effects are not isolated.
