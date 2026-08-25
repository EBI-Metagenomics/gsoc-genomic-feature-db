# Local package integration

The frontend can be consumed as the temporary private npm package
`genomic-feature-db-component`. It is tested through local `npm pack` tarballs;
it is not published and no registry is configured. Keep `"private": true` until
the project approves a public name and release process.

## Supported public API

The version 0.1 boundary is intentionally narrow:

- the `GenomicFeatureBrowser` runtime component;
- the `GenomicDataset`, `GenomicFeature`, and `GenomicFeatureBrowserProps`
  TypeScript types; and
- the `genomic-feature-db-component/styles.css` stylesheet subpath.

The `exports` field in `ui-component/package.json` enforces these two import
paths: the package root and `./styles.css`. Internal source paths are not public.
There is no public search-only component, host-owned JBrowse adapter, view-state
prop, worker API, search hook, or `GenomeView` export. JBrowse navigation and
replacement highlighting remain built into `GenomicFeatureBrowser`.

## Build and install the tarball

From `ui-component/`:

```powershell
npm ci
npm.cmd run pack:local
```

`pack:local` builds the ESM library, declarations, scoped CSS, worker graph, and
SQLite WASM assets. It creates an ignored tarball under
`ui-component/package-artifacts/` and inspects its contents. The tarball does
not include demo source, tests, sample data, or the consumer example.

Install that tarball into a React 18 application, then render the component:

```tsx
import {
  GenomicFeatureBrowser,
  type GenomicDataset,
} from "genomic-feature-db-component";
import "genomic-feature-db-component/styles.css";

const dataset: GenomicDataset = {
  accession: "MGYG000490722",
  databaseUrl: "https://data.example.org/MGYG000490722.db.zip",
  fastaUrl: "https://data.example.org/MGYG000490722.fna",
  fastaIndexUrl: "https://data.example.org/MGYG000490722.fna.fai",
  gffUrl: "https://data.example.org/MGYG000490722.gff.gz",
  gffIndexUrl: "https://data.example.org/MGYG000490722.gff.gz.tbi",
};

<GenomicFeatureBrowser
  dataset={dataset}
  onFeatureSelect={(feature) => console.log(feature)}
/>;
```

The component supplies database status, JBrowse, search controls, facets,
results, pagination, navigation, and one active replacement highlight. The host
supplies the five compatible genomic asset URLs and the surrounding page.

See [`ui-component/README.md`](../ui-component/README.md) for the full prop and
Vite configuration, styling ownership, browser support, and hosting contract.

## Independent consumer verification

`examples/package-consumer` is a clean Vite/React fixture. It installs the local
tarball instead of importing repository source, which catches missing package
files, invalid exports, duplicate React installations, and worker/WASM URL
problems that the source demo cannot detect.

Run the complete gate from `ui-component/`:

```powershell
npm.cmd run test:package
```

The script rebuilds and inspects the package, installs it into the clean
consumer, confirms a single React installation, typechecks and builds the
consumer, and runs its critical journey against both Vite development and the
built production preview. The journey observes packaged worker and WASM
responses, search, 25-row pagination, the selection callback, JBrowse
navigation, one-based-to-zero-based highlight conversion, and replacement of a
previous highlight.

See the [consumer README](../examples/package-consumer/README.md) for its purpose,
files, manual commands, and expected behavior.

## Publication status

The implementation is structurally package-ready, but publication remains a
project decision. Before removing `"private": true`, agree the official package
name and scope, registry, release owner, licence, first EBI consumer and its
React/bundler versions, Visual Framework independence, supported browsers, and
deployment environments. No publishing or registry configuration belongs in
the current local-package change.
