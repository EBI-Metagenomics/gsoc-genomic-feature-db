# Project architecture

The project builds a compact genomic feature search database offline and queries it
directly in the browser. The frontend combines that local SQLite search with an
embedded JBrowse linear genome view and can run either as the repository demo or as a
private npm tarball installed into another Vite/React application.

## Architecture at a glance

This simplified view shows what happens when someone searches for and selects a
genomic feature:

```mermaid
flowchart LR
  user([User])
  component[GenomicFeatureBrowser]
  worker[Search Web Worker]
  database[(SQLite search database<br/>on an HTTPS host)]
  jbrowse[JBrowse genome view]
  genomicFiles[(FASTA and GFF files<br/>with their indexes)]

  user -->|1. Enter a search| component
  component -->|2. Send query| worker
  worker <-->|3. Fetch database ranges| database
  worker -->|4. Return matching features| component
  user -->|5. Select a result| component
  component -->|6. Navigate and highlight| jbrowse
  jbrowse <-->|7. Fetch visible genome ranges| genomicFiles
```

The browser downloads only the required byte ranges. Search queries run locally in
the Web Worker, while JBrowse independently reads the reference and annotation
files. No application search server is required.

## System boundaries

This UML component view separates offline publication, static hosting, the consuming
application, and the package's private implementation:

```mermaid
flowchart LR
  subgraph publication["node «offline publication environment»"]
    sources[("«artifact»<br/>GFF and FASTA sources")]
    job["«external component»<br/>Publication job"]
    indexer["«component»<br/>Python indexer"]
    database[("«artifact»<br/>SQLite FTS5 database")]
    browseAssets[("«artifacts»<br/>FASTA and FAI<br/>BGZF GFF and TBI or CSI")]

    sources --> job
    job --> indexer
    indexer --> database
    job --> browseAssets
  end

  assetHost["«node»<br/>Static HTTPS asset host"]

  subgraph browser["node «browser»"]
    hostApp["«component»<br/>Host application"]

    subgraph package["package genomic-feature-db-component"]
      publicComponent["«public component»<br/>GenomicFeatureBrowser"]
      searchHook["«private component»<br/>useDbSearch"]
      worker["«private component»<br/>Database Web Worker"]
      genomeView["«private boundary»<br/>GenomeView"]
      jbrowse["«private component»<br/>Embedded JBrowse"]

      publicComponent --> searchHook
      searchHook -->|Comlink| worker
      publicComponent --> genomeView
      genomeView --> jbrowse
    end

    hostApp -->|GenomicDataset| publicComponent
    publicComponent -.->|optional onFeatureSelect| hostApp
  end

  database --> assetHost
  browseAssets --> assetHost
  worker -->|HTTP Range: SQLite| assetHost
  jbrowse -->|HTTP Range: FASTA and GFF| assetHost
```

There is no application search server at runtime. The host publishes static genomic
assets and supplies their URLs; SQLite queries run inside the browser Web Worker.

## Offline indexer

The Python modules under `scripts/`:

1. stream `.gff` or `.gff.gz` input;
2. normalize useful identity, display, and annotation fields;
3. skip configured low-value unannotated features;
4. store display rows in `feature_meta`;
5. store searchable text in the contentless `search_fts` FTS5 table;
6. write `database_metadata` with schema and generator versions;
7. optimize and verify the completed SQLite database; and
8. publish it using the historical `.db.zip` delivery suffix.

The output contains raw SQLite bytes, not a ZIP archive. See the
[schema reference](schema-reference.md) for the authoritative database contract.

## Browser search runtime

`GenomicFeatureBrowser` starts `useDbSearch` for the active database URL. The hook
owns an ES module Web Worker exposed through Comlink. The worker:

- validates range behavior, remote size, SQLite header, and schema compatibility;
- opens SQLite WASM through `sqlite-wasm-http`;
- converts user input into a safe all-fields prefix query;
- joins FTS matches to display metadata;
- returns deterministic 25-row keyset pages; and
- exposes explicit retry and complete-download recovery state.

Normal operation fetches bounded database byte ranges. It never silently changes to
a complete download after range validation fails.

## Component composition

The public component renders:

```text
GenomicFeatureBrowser
  |-- DatabaseStatus
  |-- GenomeView (private domain boundary)
  |     `-- GenomicLinearView (JBrowse implementation)
  `-- SearchBar
        |-- SearchForm
        |-- FeatureTypeFacets
        |-- AnnotationLegend / AnnotationPopover
        `-- ResultsTable + Load More
```

The public package boundary contains one runtime value, `GenomicFeatureBrowser`, and
the `GenomicDataset`, `GenomicFeature`, and `GenomicFeatureBrowserProps` types. Search
hooks, worker APIs, JBrowse models, `GenomeView`, a search-only component, and
external-JBrowse integration remain private.

The public types form this UML class diagram:

```mermaid
classDiagram
  direction LR

  class GenomicFeatureBrowser {
    <<component>>
    +render(props: GenomicFeatureBrowserProps)
  }

  class GenomicFeatureBrowserProps {
    <<interface>>
    +GenomicDataset dataset
    +number browserHeight
    +number navigationFlankBp
    +string className
    +onFeatureSelect(feature)
  }

  class GenomicDataset {
    <<interface>>
    +string accession
    +string databaseUrl
    +number databaseSizeBytes
    +string databaseSha256
    +string fastaUrl
    +string fastaIndexUrl
    +string gffUrl
    +string gffIndexUrl
    +TBI_or_CSI gffIndexType
    +string initialLocation
  }

  class GenomicFeature {
    <<interface>>
    +number id
    +string feature_id
    +string name
    +string feature_type
    +string seqid
    +number start
    +number end
    +string strand
    +string biotype
    +string description
    +string functional_summary
  }

  GenomicFeatureBrowser ..> GenomicFeatureBrowserProps : receives
  GenomicFeatureBrowserProps --> "1" GenomicDataset : dataset
  GenomicFeatureBrowserProps ..> GenomicFeature : callback value
```

Optional TypeScript properties are shown without `?` because Mermaid interprets that
character as a visibility marker. `GenomicFeatureBrowser` is the only public runtime
value; the other three boxes are public TypeScript interfaces.

React and React DOM are peer dependencies. JBrowse, MobX, Comlink, SQLite WASM, and
the HTTP VFS are package runtime dependencies.

## JBrowse boundary and selection

`GenomeView` receives only project-domain data: the dataset, selected feature,
height, and navigation flank. JBrowse imports, model state, assembly/track builders,
coordinate conversion, and highlighting stay behind that boundary.

Selecting a result:

1. updates the component's selected `GenomicFeature`;
2. calls the optional host `onFeatureSelect` callback;
3. navigates the existing JBrowse view to a flanked one-based location; and
4. replaces its highlight with the zero-based half-open interval
   `[start - 1, end)`.

The complete runtime interaction is shown in this UML sequence diagram:

```mermaid
sequenceDiagram
  autonumber
  actor User
  participant Host as Host application
  participant Browser as GenomicFeatureBrowser
  participant Hook as useDbSearch
  participant Worker as Database Web Worker
  participant Assets as Static asset host
  participant Boundary as GenomeView
  participant JBrowse as Embedded JBrowse

  Host->>Browser: render(dataset, onFeatureSelect)

  par Initialize search database
    Browser->>Hook: initialize(databaseUrl, integrity)
    Hook->>Worker: initFromUrl()
    Worker->>Assets: HEAD and bounded Range requests
    Assets-->>Worker: SQLite header and pages
    Worker->>Worker: validate transport, SQLite, and schema
    Worker-->>Hook: ready with diagnostics
    Hook-->>Browser: enable search UI
  and Initialize genome view
    Browser->>Boundary: render(dataset, no selection)
    Boundary->>JBrowse: create assembly, tracks, and view
    JBrowse->>Assets: request indexed FASTA and GFF ranges
    Assets-->>JBrowse: reference and annotation blocks
  end

  User->>Browser: submit query
  Browser->>Hook: search(query)
  Hook->>Worker: searchPage(query)
  Worker->>Assets: request required SQLite page ranges
  Assets-->>Worker: SQLite pages
  Worker->>Worker: FTS5 query and keyset page
  Worker-->>Hook: features, cursor, diagnostics
  Hook-->>Browser: render results

  User->>Browser: select feature
  opt Host supplied onFeatureSelect
    Browser-->>Host: onFeatureSelect(feature)
  end
  Browser->>Boundary: selectedFeature
  Boundary->>JBrowse: setHighlight([exact interval])
  Boundary->>JBrowse: navToLocString(flanked location)
  JBrowse->>Assets: request newly visible indexed ranges
  Assets-->>JBrowse: reference and annotation blocks
  JBrowse-->>User: show navigation and replacement highlight
```

Changing `accession` or `databaseUrl` recreates the composed instance, disposing old
search and view state. Ordinary selections reuse the existing JBrowse model.

## Dataset and hosting contract

Each `GenomicDataset` identifies one internally consistent assembly:

| Asset                  | Runtime consumer           |
| ---------------------- | -------------------------- |
| Raw SQLite `.db.zip`   | SQLite HTTP VFS worker     |
| FASTA `.fna`           | JBrowse reference adapter  |
| FASTA index `.fna.fai` | JBrowse reference adapter  |
| BGZF GFF `.gff.gz`     | JBrowse annotation adapter |
| TBI or CSI index       | JBrowse annotation adapter |

SQLite `seqid`, FASTA reference names, and GFF sequence names must match exactly.
The static host must preserve raw bytes, support HTTP Range requests, and expose
range and validator headers through CORS when origins differ.

## Demo and package builds

The frontend has separate entry and asset boundaries:

- `npm run dev` runs the source demo and serves the local sample fixture through
  development-only Range middleware.
- `npm run build:demo` builds the repository demo and intentionally copies sample
  data.
- `npm run build` and `npm run build:lib` create the reusable ESM package output,
  declarations, scoped CSS, worker graph, and WASM.
- `npm run pack:local` creates and inspects the ignored local tarball.
- `npm run test:package` installs that tarball into the independent
  `examples/package-consumer` application and exercises development and production
  preview.

The package uses an explicit `files` allow-list, so demo source, sample data, tests,
benchmarks, and consumer files are not shipped.

## Styling ownership

Package CSS is limited to project-owned `cvf-` component selectors. Demo layout and
global `body`/`#root` rules live outside the package stylesheet. The host application
owns Visual Framework globals, page layout, and surrounding navigation.

## Verification layers

- Python tests cover parsing, schema, indexing, and search behavior.
- Vitest covers search helpers, transport guards, pagination, components, and
  JBrowse configuration/navigation.
- Repository Playwright tests cover the demo, five-file Range delivery, recovery,
  runtime assets, search, pagination, and JBrowse behavior.
- Package-consumer Playwright tests observe the installed worker and WASM and repeat
  the critical search-to-highlight journey in development and production.
- Browser performance benchmarks are opt-in and remain separate from normal
  regression tests.

See the [user guide](USAGE.md), [package integration](package-integration.md), and
[production data integration](production-data-integration.md) for operational
commands and deployment details.
