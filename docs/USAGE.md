# User Guide

## Choose the workflow

There are two supported local frontend workflows:

1. The repository demonstration under `ui-component` runs directly from source
   and uses the committed `sample_data` fixture.
2. The packed-package consumer under `examples/package-consumer` installs the
   local npm tarball and proves how a separate Vite/React application consumes
   the public component API.

The consumer is an executable example and integration test. It is not a second
publishable package, and it is excluded from the component tarball. See its
[folder README](../examples/package-consumer/README.md) for its directory guide
and manual test instructions.

## Run the bundled demonstration

`MGYG000490722` is the supported demonstration dataset. Its complete runtime
bundle is already committed at `sample_data/MGYG000490722/`, so no data download
is needed for the local demo. The bundle contains:

- `MGYG000490722.gff.gz` and its Tabix index (`.tbi`)
- `MGYG000490722.fna` and its FASTA index (`.fai`)
- `MGYG000490722.db.zip`, the generated raw SQLite search database. The
  `.db.zip` filename is a delivery convention to discourage automatic HTTP
  compression; it is not a ZIP archive.

From a fresh checkout, install the exact frontend dependencies and start Vite:

```powershell
cd ui-component
npm ci
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). JBrowse
appears immediately at a small 5 kbp initial region with its reference and
annotation tracks active. The indexed adapters fetch only the data ranges needed
for that window. Search for at least three characters and select a result; the
existing view navigates to and highlights the feature while fetching any
additional ranges needed for the selected region.

The local development server exposes the fixture in
`sample_data/MGYG000490722/` under the `/MGYG000490722/` URL path. The directory
name is not part of the browser URL. `npm run dev` serves these files with
byte-range responses. To test the built demo, run `npm run build:demo` before
`npm run preview`; the demo build copies the fixture into `dist/`. This is
development/demo behavior, not the production data architecture.

The default `npm run build` is the reusable package build and excludes
`sample_data/`. Use `npm run build:demo` only when intentionally creating a
self-contained demonstration. Production must publish the five files through
the approved HTTPS data service, with range support and CORS when the
application and data have different origins. See
[Production data integration](production-data-integration.md).

## Use the local component package

The reusable frontend currently uses the temporary private name
`genomic-feature-db-component`. It is tested only through local `npm pack`
tarballs; do not publish it or remove `"private": true` before the package name,
licence, registry, release owner, and first EBI consumer are approved.

Build the package and create the tarball:

```powershell
cd ui-component
npm.cmd run pack:local
```

Run the complete clean-consumer verification:

```powershell
npm.cmd run test:package
```

This installs the tarball into `examples/package-consumer`, verifies one React
installation, typechecks and builds the consumer, and runs the same critical
journey against Vite development and production preview. The journey observes
the packaged database worker and SQLite WASM responses, searches, loads another
25-result page, navigates JBrowse, checks exact coordinate conversion, and
confirms that a second selection replaces the first highlight.

Package consumers import only:

```tsx
import {
  GenomicFeatureBrowser,
  type GenomicDataset,
} from "genomic-feature-db-component";
import "genomic-feature-db-component/styles.css";
```

The only public value export is `GenomicFeatureBrowser`. Search hooks, worker
APIs, the private genome-view seam, a search-only component, and external
JBrowse state are not public APIs. See the [package README](../ui-component/README.md)
for the complete `GenomicDataset` example, Vite settings, compatibility target,
and runtime asset-server contract.

## Regenerate the search database

The committed database is ready to use. To rebuild it from the bundled GFF:

```powershell
python scripts/indexer.py sample_data/MGYG000490722/MGYG000490722.gff.gz
```

This replaces the database beside the GFF. Do not commit a regenerated artifact
unless its change is intentional and reviewed.

To choose the output location explicitly, including for a `.gff3.gz` file:

```powershell
python scripts/indexer.py C:\data\annotations.gff3.gz `
  --output C:\data\annotations.db.zip
```

Supported inputs are GFF3 text files with `.gff`, `.gff3`, `.gff.gz` or
`.gff3.gz` extensions. Feature rows need the standard nine tab-separated
columns. The parser stops at `##FASTA`, skips comments and malformed rows, and
normalizes attribute names for search. Sequence names must match the reference
names used by the configured JBrowse assembly.

## Host a generated database

Serve the raw SQLite `.db.zip` database as an immutable static asset. The
`.db.zip` filename is intentional: it helps prevent automatic HTTP compression
of a range-addressed database, but the file is not compressed and must not be
extracted. The host must support
HTTP byte ranges (`Accept-Ranges: bytes` and correct `206 Partial Content`
responses), preserve `Content-Length`, and allow cross-origin `GET`, `HEAD` and
`Range` requests when the UI and data use different origins.

The database URL and its exact byte size are part of the runtime contract. See
[Production data integration](production-data-integration.md) for example
headers, CORS requirements and validation commands.

## Configure search and JBrowse

Pass one `GenomicDataset` object to the reusable component. Its database URL and
size configure search; its assembly and tracks configure JBrowse:

```tsx
<GenomicFeatureBrowser
  dataset={{
    accession: "my-dataset",
    databaseUrl: "https://data.example.org/annotations.db.zip",
    databaseSizeBytes: 12345678,
    fastaUrl: "https://data.example.org/reference.fna",
    fastaIndexUrl: "https://data.example.org/reference.fna.fai",
    gffUrl: "https://data.example.org/annotations.gff.gz",
    gffIndexUrl: "https://data.example.org/annotations.gff.gz.tbi",
  }}
/>
```

These URLs let the component construct its internal JBrowse assembly and GFF
track. A selected search row supplies `seqid`, `start` and `end` to that view.
GFF coordinates are one-based inclusive; the component performs the required
zero-based highlight conversion. `seqid` must exactly match a JBrowse
`refName`. Complete configuration examples and the navigation/highlighting
contract are in [Package integration](package-integration.md) and [JBrowse
integration](jbrowse-integration.md).

## Common errors and troubleshooting

- **Database request returns `200` instead of `206`:** enable byte-range serving
  and ensure a proxy or CDN does not strip the `Range` header.
- **Database size mismatch:** update `sizeBytes` after regenerating or deploying
  the database; it must equal the exact raw SQLite byte size served at the
  `.db.zip` URL.
- **CORS or `HEAD` failure:** allow the UI origin and expose range and length
  headers. Test both `HEAD` and a small byte-range `GET`.
- **Search result does not navigate:** make the indexed GFF `seqid` and JBrowse
  assembly reference names identical.
- **Worker or WASM asset returns HTML/404:** retain the package's Vite worker and
  WASM handling and deploy generated assets without rewriting them to the app
  shell.
- **No search results:** verify that the database was produced by a compatible
  schema version and that the query uses the documented all-term prefix search
  semantics.

## Browser support and E2E testing

Chromium-based browsers and Firefox are the supported/tested browsers. CI runs
the Chromium critical search-to-JBrowse workflow and the five-file range
delivery contract. Run Firefox locally before a release or when changing
browser-sensitive UI code. WebKit and performance checks are optional local
validation, not pull-request merge gates.

Install the supported Playwright browser binaries once per checkout:

```powershell
cd ui-component
npx playwright install chromium firefox
```

Run the critical test in each browser, or the full configured suite:

```powershell
npm run test:e2e -- e2e/genomic-search.spec.ts --project=chromium
npm run test:e2e -- e2e/range-delivery.spec.ts --project=chromium
npm run test:e2e -- e2e/genomic-search.spec.ts --project=firefox
npm run test:e2e
```

The critical test intentionally ignores console errors whose source is one of
the known external Visual Framework/CDN hosts (`assets.emblstatic.net`,
`ebi.emblstatic.net`, and `www.embl.org`). Application console errors and page
errors still fail the test.

## Demo dataset provenance

The `MGYG000490722` bundle was supplied for this project by an
EBI-Metagenomics mentor. It is included solely to make the demonstration and its
end-to-end test reproducible. A public distribution licence or explicit
permission to retain the bundle in this public repository has not yet been
recorded in the project; it must be confirmed with the mentor before Issue #12
is closed or the bundle is redistributed beyond this repository.
