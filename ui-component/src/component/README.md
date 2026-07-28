# Search UI Components

The search interface is split into small, single-responsibility components, mirroring
the `scripts/` backend conventions (a central config, terse one-liner comments, and
manageable file sizes). `SearchBar.tsx` is the orchestrator; the other files are the
pieces it composes.

## Module map

| File                     | Role                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `SearchBar.tsx`          | Orchestrator — owns query state + the debounce timer, composes the form and table.                          |
| `SearchForm.tsx`         | The all-fields search row: debounced input + submit button (stateless).                                     |
| `ResultsTable.tsx`       | Sticky-header results table; delegates the Annotations column to `AnnotationCell`.                          |
| `AnnotationBadges.tsx`   | The badge `AnnotationCell` / `AnnotationPopover` / `AnnotationLegend` components + the single-popover hook. |
| `annotations/sources.ts` | Source catalogue data (badge letters, labels, colours) and the GFF-tag → source map.                        |
| `annotations/parse.ts`   | Parses a `functional_summary` string into ordered, grouped sources.                                         |
| `../config.ts`           | Central constants (query length, debounce, FTS allow-list, layout, etc.) shared across the UI and worker.   |

## Functionality overview

### 1. User interface & search input

- **Debounced querying**: input is debounced by `DEBOUNCE_MS` (200 ms) and a search only
  runs once the query reaches `MIN_QUERY_LENGTH` (4 characters). Both values live in
  `config.ts` and are shared with `useDbSearch` and `db.worker` so the thresholds never drift.
- **All-fields search**: production searches feature IDs, names, biotypes,
  descriptions, and functional annotations together; there is no field dropdown.
- **Dynamic feedback**: loading spinner, query execution time (ms), result counts, and
  error banners.
- **Result visualization**: a table of `Feature ID` (the stable `feature_id`, with the
  gene symbol as a muted subtitle), `Type`, `Position`, `Strand`, `Biotype` (muted `—`
  when absent, common for prokaryotic data), `Description`, and `Annotations`.
- **Annotation badges**: `functional_summary` is collapsed into compact, colour-coded
  single-letter source badges; clicking one opens a popover listing every value, and a
  legend decodes the letters currently on screen.
- **Color-coded type badges**: feature types (`gene`, `mRNA`, `CDS`, …) get distinct
  badge styles via the `FEATURE_TYPE_BADGE_CLASS` map in `config.ts`.

### 2. Architecture & data flow

The components sit at the top of a local-first pipeline:

1. **The hook (`useDbSearch.ts`)** — owns the Web Worker lifecycle and exposes
   paginated state, `search(query)`, and `loadMore()`.
2. **The Web Worker (`db.worker.ts`)** — loads the SQLite database via **HTTP VFS**
   (Range requests, no full download), sanitises the query (`workers/fts.ts`), and runs
   an `FTS5 MATCH` query against `search_fts`, joining matches to `feature_meta`.
   Results use stable rowid ordering and keyset pagination.
3. **The indexer (`scripts/`)** — `parser.py` parses `.gff` / `.gff.gz` files and
   `database.py` builds the compact two-table SQLite database
   (`{gff-name}.db.zip`) the worker queries.

4. **Result selection** — the stable feature ID is an explicit keyboard-accessible
   button. Selecting it sets `aria-current="location"`, calls the public callback,
   and sends the feature's one-based GFF coordinates to the existing JBrowse view.
   A dataset change clears the selection, terminates the previous worker, and
   recreates the accession-keyed JBrowse state.

### Testing multiple accessions

The demo hides the accession selector when `DEMO_DATASETS` contains only one
entry and displays it automatically when two or more entries are registered.
To test switching, add a complete five-file runtime bundle under
`sample_data/<accession>/`, then add the matching URLs and initial location to
`src/demo/datasets.ts`. Restart the Vite server after adding filesystem assets.

## Props

```typescript
interface SearchBarProps {
  results: GenomicFeature[]; // Array of matched genomic features
  selectedFeature: GenomicFeature | null; // Current JBrowse navigation target
  onSelectFeature: (feature: GenomicFeature) => void; // Explicit selection callback
  loading: boolean; // True while the SQLite DB is still initializing
  searching: boolean; // True while a search query is in-flight
  loadingMore: boolean; // True while another page is loading
  hasMore: boolean; // Whether another page may exist
  elapsed: number; // Execution time of the last query in ms
  search: (query: string) => Promise<void>; // All-fields search trigger
  loadMore: () => Promise<void>; // Append the next result page
}
```
