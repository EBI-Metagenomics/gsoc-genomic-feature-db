# Genomic feature database component

`genomic-feature-db-component` is the temporary private package for the composed
browser-local SQLite search and embedded JBrowse linear genome view. It is not
published to npm. Install only a local tarball created with `npm run pack:local`.

```tsx
import { GenomicFeatureBrowser, type GenomicDataset } from "genomic-feature-db-component";
import "genomic-feature-db-component/styles.css";

const dataset: GenomicDataset = {
  accession: "MGYG000490722",
  databaseUrl: "/data/MGYG000490722.db.zip",
  databaseSizeBytes: 18_558_976,
  databaseSha256: "6f486bd3ebcad27a4f1e7968fc06fafac349ed21889058ff9e72e2b67ce26e28",
  fastaUrl: "/data/MGYG000490722.fna",
  fastaIndexUrl: "/data/MGYG000490722.fna.fai",
  gffUrl: "/data/MGYG000490722.gff.gz",
  gffIndexUrl: "/data/MGYG000490722.gff.gz.tbi",
  gffIndexType: "TBI",
  initialLocation: "MGYG000490722_1:1..5000",
};

<GenomicFeatureBrowser dataset={dataset} />;
```

## Supported Vite consumer setup

The supported version 0.1 consumer is a Vite 5 React application. Keep the
component outside dependency optimization so Vite can transform its packaged
worker URL, prebundle the external JBrowse graph for development-mode CommonJS
compatibility, and emit workers as ES modules:

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

The independently installed reference application is under
[`examples/package-consumer`](../examples/package-consumer/README.md). Other
bundlers require separate worker, WASM, and JBrowse compatibility testing.

The only public value export in version 0.1 is `GenomicFeatureBrowser`. The
public types are `GenomicDataset`, `GenomicFeature`, and
`GenomicFeatureBrowserProps`. Search hooks, workers, JBrowse state, and the
private genome-view seam are deliberately not exported.

The host owns Visual Framework globals. The tested demo uses Visual Framework
2.5.28; load its global CSS before the package stylesheet. The package CSS
contains only project-owned `cvf-` component rules and never styles `body`,
`#root`, demo page layout, headers, or footers.

## Runtime contract

All five asset URLs must refer to one immutable assembly. The server must honor
byte ranges, preserve raw SQLite/FASTA/BGZF bytes, and expose range and validator
headers through CORS. Do not transparently content-encode `.db.zip`, `.fna`, or
`.gff.gz`. The `.db.zip` suffix contains raw SQLite bytes, not a ZIP archive.

The SQLite feature `seqid`, FASTA reference names, and GFF sequence names must
match exactly. Search-result coordinates are one-based inclusive. Navigation
uses those coordinates plus the configured flank; the native JBrowse highlight
uses `[start - 1, end)` and replaces the previous highlight.

Range initialization failures offer an explicit complete-download fallback.
Provide `databaseSizeBytes` and `databaseSha256` so that fallback can reject a
truncated or changed response.

## Compatibility and versioning

Version 0.1 is client-only ESM tested with Node 22, React 18.3, and Vite 5. It
supports SQLite search schema version 1 exactly. Package semantic versions,
indexer generator versions, and database schema versions are separate values.
A change to public props, exported types, documented `cvf-` selectors, or the
supported schema range requires release notes and may require a package major
version. Other bundlers and server-side rendering are not supported yet.

## Local development

```text
npm run build:lib     # ESM, declarations, CSS, worker, and WASM
npm run build:demo    # repository demonstration application
npm run pack:local    # package-artifacts/*.tgz; never publishes
npm run test:package  # clean tarball consumer build and browser journeys
```

Worker or WASM 404s usually mean a consumer copied `index.js` without the full
packed `dist/assets` tree. Range errors mean the asset host returned `200`
instead of `206`, compressed bytes in transit, or omitted CORS-exposed headers.
Schema errors require regenerating the database with the compatible indexer.
JBrowse track errors usually indicate a mismatched FASTA/FAI, GFF/index pair,
wrong `gffIndexType`, or inconsistent sequence names.
