# Component internals

This directory contains the UI composed by the public `GenomicFeatureBrowser`
package component. It documents implementation details for contributors; package
installation, Vite configuration, and the supported runtime contract are documented
in the [package README](../../README.md).

The initial package intentionally exports the complete search-and-JBrowse experience.
It does not export a search-only component, search hooks, worker APIs, or JBrowse state.

## Module map

| File                            | Role                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `GenomicFeatureBrowser.tsx`     | Public wrapper that owns selection state and composes database status, the private genome view, and search UI.     |
| `DatabaseStatus.tsx`            | Database initialization, transfer diagnostics, retry, and explicit complete-download fallback UI.                  |
| `SearchBar.tsx`                 | Internal search orchestrator; owns query/debounce state and composes facets, results, pagination, and annotations. |
| `SearchForm.tsx`                | Stateless all-fields search input and submit button.                                                               |
| `FeatureTypeFacets.tsx`         | Displays feature-type counts for the results currently loaded in the browser.                                      |
| `ResultsTable.tsx`              | Keyboard-accessible, sticky-header results table and feature-selection buttons.                                    |
| `AnnotationBadges.tsx`          | Annotation cells, legend, popover, and the single-open-popover hook.                                               |
| `annotations/sources.ts`        | Annotation source catalogue: badge letters, labels, colors, and GFF-tag mappings.                                  |
| `annotations/parse.ts`          | Parses `functional_summary` into ordered annotation groups.                                                        |
| `../genome-view/GenomeView.tsx` | Private domain boundary around the JBrowse implementation.                                                         |
| `../config.ts`                  | Shared search, pagination, layout, and badge constants.                                                            |

## Composed UI

`GenomicFeatureBrowser` renders, in order:

1. database loading and recovery status;
2. the built-in JBrowse linear genome view; and
3. search controls, loaded-result facets, annotations, results, and pagination.

The host supplies one `GenomicDataset`. `BrowserInstance` starts `useDbSearch` for
that dataset's database URL and stores the currently selected `GenomicFeature`.
Changing the accession or database URL changes the wrapper key, which disposes the
old worker, results, selection, and JBrowse state before creating the next instance.

## Search behavior

- Input is debounced by `DEBOUNCE_MS` (200 ms).
- Queries shorter than `MIN_QUERY_LENGTH` (3 characters) clear the current results.
- Production search covers feature IDs, names, biotypes, descriptions, and functional
  annotations together; there is no field selector.
- Results use deterministic rowid keyset pagination with 25 rows per page.
- The UI reports rows loaded, elapsed query time, and whether another page is
  available. It does not run a separate global-count query.
- `FeatureTypeFacets` counts only the rows currently loaded and grows after
  **Load More**.
- Annotation values are grouped into compact source badges. Only one annotation
  popover is open at a time.

## Database flow

1. `useDbSearch` owns the module Web Worker lifecycle and exposes initialization,
   search, pagination, retry, and fallback state.
2. `db.worker.ts` validates the server and database schema, opens SQLite through the
   HTTP VFS, builds a safe FTS5 expression, and joins matches from `search_fts` to
   display rows in `feature_meta`.
3. Normal loading uses bounded HTTP Range requests. A complete download is available
   only as an explicit recovery action after range initialization fails.
4. Optional `databaseSizeBytes` and `databaseSha256` values let the worker reject a
   truncated or changed complete-download response.

The `.db.zip` filename is an HTTP delivery convention that discourages automatic
HTTP compression; the file contains raw SQLite bytes, not a ZIP archive.

## Selection and JBrowse flow

Selecting a result:

1. stores the domain `GenomicFeature` in `GenomicFeatureBrowser`;
2. calls the optional public `onFeatureSelect` callback;
3. passes the feature to the private `GenomeView` boundary;
4. navigates the existing JBrowse view to the feature plus `navigationFlankBp`;
5. converts one-based inclusive GFF coordinates `[start, end]` into the zero-based,
   half-open JBrowse highlight `[start - 1, end)`; and
6. replaces the previous native JBrowse highlight with the selected interval.

The highlight is an interval band. It does not programmatically select or recolor a
specific rendered GFF feature glyph. GFF `seqid` values are passed directly to
JBrowse as reference names, so the SQLite, FASTA, and GFF sequence names must match.

## Public package boundary

The package root exports one runtime value:

```ts
GenomicFeatureBrowser;
```

It also exports these TypeScript types:

```ts
GenomicDataset;
GenomicFeature;
GenomicFeatureBrowserProps;
```

The public import is:

```tsx
import { GenomicFeatureBrowser, type GenomicDataset } from "genomic-feature-db-component";
import "genomic-feature-db-component/styles.css";
```

Do not expose or deep-import `SearchBar`, `useDbSearch`, `GenomeView`, worker
modules, or JBrowse models. A future `GenomicFeatureSearch` or external-JBrowse API
requires an additive public design and mentor/consumer approval.

## Public props

```ts
interface GenomicFeatureBrowserProps {
  dataset: GenomicDataset;
  browserHeight?: number; // Defaults to 450
  navigationFlankBp?: number; // Defaults to 1,000
  className?: string;
  onFeatureSelect?: (feature: GenomicFeature) => void;
}
```

`GenomicDataset` supplies the accession, raw SQLite URL, FASTA/FAI URLs, BGZF
GFF/index URLs, and an optional initial location. The database size and SHA-256 are
optional but recommended integrity metadata. See `src/types.ts` and the package
README for the authoritative definitions and complete example.

## Demo datasets

The repository demo hides its accession selector when `DEMO_DATASETS` contains one
entry and displays it when two or more entries are registered. To test switching,
add a complete five-file runtime bundle under `sample_data/<accession>/` and add its
host-resolved URLs to `src/demo/datasets.ts`.

This registry and its local Range-capable data server are demo fixtures. Production
hosts supply approved asset URLs through `GenomicDataset`.

## Package-level verification

The independent consumer under
[`examples/package-consumer`](../../../examples/package-consumer/README.md) installs
the npm tarball instead of importing repository source. Its browser journey verifies
worker/WASM loading, CSS isolation, search, pagination, the selection callback,
JBrowse navigation, exact highlight conversion, and highlight replacement in both
development and production-preview modes.
