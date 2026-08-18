# Genomic feature browser UI

This directory contains the React/Vite frontend for the genomic feature database
project. It has two supported roles:

| Workflow         | Purpose                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Repository demo  | Runs the UI directly from source with the committed `MGYG000490722` sample dataset.                                   |
| Reusable package | Builds the private `genomic-feature-db-component` npm tarball and verifies it in an independent consumer application. |

Both workflows provide browser-local SQLite search, pagination, and an embedded
JBrowse linear genome view. Selecting a search result navigates to its flanked
location and replaces the previous native JBrowse highlight.

## Requirements

- Node.js 22.x and npm
- A Chromium-based browser or Firefox for supported browser testing
- Python 3.10+ only when rebuilding the sample SQLite database

Install the committed frontend dependency tree:

```powershell
cd ui-component
npm.cmd ci
```

## Run the repository demo

Start Vite:

```powershell
npm.cmd run dev
```

Open the URL printed by Vite, normally <http://localhost:5173>. The demo uses the
complete five-file fixture under `../sample_data/MGYG000490722/`; no separate data
download is required.

Search for at least three characters, for example `MGYG000490722_00001`, and select
a result to navigate and highlight it in JBrowse. Search results use stable 25-row
keyset pages, and **Load More** appends the next page.

Create a self-contained demo build with:

```powershell
npm.cmd run build:demo
npm.cmd run preview
```

`build:demo` intentionally copies the sample fixture. The normal package build does
not include sample data.

## UI composition

`GenomicFeatureBrowser` composes:

1. database initialization, diagnostics, retry, and explicit fallback status;
2. the built-in JBrowse linear genome view; and
3. the search form, loaded-result facets, annotation badges, results table, and
   pagination controls.

Database work runs in an ES module Web Worker through Comlink. SQLite WASM and
`sqlite-wasm-http` query the remote database using HTTP Range requests so normal
search does not require downloading the complete database. JBrowse uses indexed
FASTA and BGZF GFF assets from the same dataset.

Contributor details are in the
[component internals guide](src/component/README.md). Dataset generation and broader
project usage are documented in the [repository user guide](../docs/USAGE.md).

## Development and validation

| Command                     | Purpose                                                         |
| --------------------------- | --------------------------------------------------------------- |
| `npm run typecheck`         | Typecheck application, tests, and build configuration.          |
| `npm run lint`              | Run ESLint.                                                     |
| `npm run format:check`      | Check Prettier formatting.                                      |
| `npm test`                  | Run Vitest unit/component tests.                                |
| `npm run build:demo`        | Typecheck and build the repository demo with sample data.       |
| `npm run test:e2e`          | Run the configured Playwright application journeys.             |
| `npm run benchmark:browser` | Run the opt-in browser benchmark; not a normal regression gate. |

Install Playwright browsers once when needed:

```powershell
npx playwright install chromium firefox
```

Chromium critical tests cover search, pagination, runtime assets, HTTP Range
delivery/recovery, and search-to-JBrowse behavior. Firefox is an expected local
release check for browser-sensitive changes. WebKit and performance measurements are
optional local validation unless a review explicitly requests them.

## Reusable local package

The temporary package name is `genomic-feature-db-component`, version `0.1.0`. It
remains `"private": true`, is not published to npm, and has no configured registry or
publish script. Local testing always uses the tarball produced by `npm pack`.

Build the library or create its inspected tarball:

```powershell
npm.cmd run build:lib
npm.cmd run pack:local
```

The build produces:

- a client-only ESM entry;
- TypeScript declarations;
- scoped component CSS;
- the database worker module graph; and
- the SQLite WASM runtime.

`pack:local` writes the ignored artifact under `package-artifacts/` and rejects a
tarball missing its entry, declarations, CSS, worker, or WASM. It also rejects source,
tests, demo data, and browser-test output.

Run the full clean-consumer workflow with:

```powershell
npm.cmd run test:package
```

This installs the tarball into
[`examples/package-consumer`](../examples/package-consumer/README.md), confirms one
React installation, typechecks and builds that application, and runs the critical
journey against both Vite development and production-preview servers.

## Public package API

The only public runtime value is:

```ts
GenomicFeatureBrowser;
```

The public TypeScript types are:

```ts
GenomicDataset;
GenomicFeature;
GenomicFeatureBrowserProps;
```

Search hooks, worker APIs, the private genome-view seam, JBrowse models, a search-only
component, and external-JBrowse integration are not public APIs.

## Package usage

Install the generated tarball into a React application:

```powershell
npm.cmd install path\to\genomic-feature-db-component-0.1.0.tgz
```

Import the component and its stylesheet:

```tsx
import { GenomicFeatureBrowser, type GenomicDataset } from "genomic-feature-db-component";
import "genomic-feature-db-component/styles.css";

const dataset: GenomicDataset = {
  accession: "MGYG000490722",
  databaseUrl: "/data/MGYG000490722.db.zip",
  databaseSizeBytes: 15_581_184,
  databaseSha256: "cc38d6ca17b78717037bd4486daaad620f57c1b0f9b578de45d8b81a55cff316",
  fastaUrl: "/data/MGYG000490722.fna",
  fastaIndexUrl: "/data/MGYG000490722.fna.fai",
  gffUrl: "/data/MGYG000490722.gff.gz",
  gffIndexUrl: "/data/MGYG000490722.gff.gz.tbi",
  gffIndexType: "TBI",
  initialLocation: "MGYG000490722_1:1..5000",
};

<GenomicFeatureBrowser dataset={dataset} onFeatureSelect={(feature) => console.log(feature)} />;
```

The component supplies database status, JBrowse, search, results, annotations,
facets, pagination, navigation, and highlighting. The host supplies its dataset URLs,
page layout, Visual Framework globals, and any behavior attached to
`onFeatureSelect`.

## Supported Vite consumer setup

The supported version 0.1 consumer is a Vite 5 React application. Keep the component
outside dependency optimization so Vite can transform its packaged worker URL,
prebundle the external JBrowse graph for development-mode CommonJS compatibility,
and emit workers as ES modules:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  optimizeDeps: {
    include: ["@jbrowse/react-linear-genome-view2", "mobx"],
    exclude: ["genomic-feature-db-component", "@sqlite.org/sqlite-wasm", "sqlite-wasm-http"],
  },
});
```

Other bundlers require separate worker, WASM, and JBrowse compatibility testing.

## Styling contract

The package stylesheet contains project-owned `cvf-` component rules. It does not
style `body`, `#root`, demo layout, headers, or footers. The host owns global Visual
Framework assets; the tested repository demo uses Visual Framework 2.5.28. Load host
global CSS before `genomic-feature-db-component/styles.css`.

## Runtime asset contract

All dataset URLs must refer to one immutable assembly:

- raw SQLite delivered with the `.db.zip` filename (a convention that
  discourages automatic HTTP compression, not a ZIP archive);
- uncompressed FASTA and its `.fai` index; and
- BGZF-compressed GFF and its `.tbi` or `.csi` index.

The asset server must preserve the raw bytes, support HTTP Range requests, and expose
range and validator headers through CORS when origins differ. Do not transparently
content-encode `.db.zip`, `.fna`, or `.gff.gz`. The SQLite feature `seqid`, FASTA
reference names, and GFF sequence names must match exactly.

Search coordinates are one-based inclusive. Navigation adds the configured flank,
while the native JBrowse highlight uses `[start - 1, end)` and replaces the previous
highlight.

Provide `databaseSizeBytes` and `databaseSha256` when possible so the explicit
complete-download fallback can reject a truncated or changed response.

## Compatibility and versioning

Version 0.1 is client-only ESM targeting Node 22, React 18.3, Vite 5, and SQLite
search schema version 1. React and React DOM are peer dependencies. Package semantic
versions, indexer generator versions, and database schema versions are separate.

Changes to public props, exported types, documented `cvf-` selectors, or the supported
schema range require release notes and may require a package major version. Server-side
rendering and bundlers other than Vite are not supported yet.

## Troubleshooting

- Worker or WASM 404: install the complete tarball and use the documented Vite
  configuration; do not copy only `dist/index.js`.
- Range initialization error: confirm `206` responses, raw bytes, and exposed CORS
  headers.
- Schema error: regenerate the database with a compatible indexer.
- JBrowse track error: confirm matching FASTA/FAI and GFF/index pairs,
  `gffIndexType`, and sequence names.
- Vite development import error: confirm the JBrowse/MobX `optimizeDeps.include`
  entries are present.
