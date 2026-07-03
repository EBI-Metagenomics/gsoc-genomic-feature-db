# Search UI Components

The search interface is split into small, single-responsibility components, mirroring
the `scripts/` backend conventions (a central config, terse one-liner comments, and
manageable file sizes). `SearchBar.tsx` is the orchestrator; the other files are the
pieces it composes.

## Module map

| File | Role |
|------|------|
| `SearchBar.tsx` | Orchestrator — owns query/column state + the debounce timer, composes the form and table. |
| `SearchForm.tsx` | The search row: column-scope `<select>` + debounced input + submit button (stateless). |
| `ResultsTable.tsx` | Sticky-header results table; delegates the Annotations column to `AnnotationCell`. |
| `AnnotationBadges.tsx` | The badge `AnnotationCell` / `AnnotationPopover` / `AnnotationLegend` components + the single-popover hook. |
| `annotations/sources.ts` | Source catalogue data (badge letters, labels, colours) and the GFF-tag → source map. |
| `annotations/parse.ts` | Parses a `functional_summary` string into ordered, grouped sources. |
| `../config.ts` | Central constants (query length, debounce, columns, layout, etc.) shared across the UI and worker. |

## Functionality overview

### 1. User interface & search input
- **Debounced querying**: input is debounced by `DEBOUNCE_MS` (200 ms) and a search only
  runs once the query reaches `MIN_QUERY_LENGTH` (4 characters). Both values live in
  `config.ts` and are shared with `useDbSearch` and `db.worker` so the thresholds never drift.
- **Column-scoped search**: a dropdown restricts matching to a single FTS column
  (Feature ID, Name, Biotype, Description, Annotations) or all fields, leveraging the
  FTS5 `detail=column` index.
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
   `results`, `loading`, `searching`, and the `search(query, column?)` callback.
2. **The Web Worker (`db.worker.ts`)** — loads the SQLite database via **HTTP VFS**
   (Range requests, no full download), sanitises the query (`workers/fts.ts`), and runs
   a two-stage `FTS5 MATCH` query against `search_fts`, joining the top matches to
   `feature_meta`. Results come back ordered by rank.
3. **The indexer (`scripts/`)** — `parser.py` parses `.gff` / `.gff.gz` files and
   `database.py` builds the compact two-table SQLite database (`genomics.db.zip`) the
   worker queries.

## Props
```typescript
interface SearchBarProps {
  results: GenomicFeature[];         // Array of matched genomic features
  loading: boolean;                  // True while the SQLite DB is still initializing
  searching: boolean;                // True while a search query is in-flight
  status: string;                    // Status message (e.g., "Connecting to database…")
  error: string | null;              // Error message, if any
  elapsed: number;                   // Execution time of the last query in ms
  search: (query: string, column?: string) => Promise<void>; // The search trigger
}
```
