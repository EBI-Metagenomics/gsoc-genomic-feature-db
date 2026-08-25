# Packed package consumer

This directory is a private Vite/React application used to demonstrate and
test the locally packed `genomic-feature-db-component` package. It is not a
second publishable package, and it is not included in the component tarball.

The fixture deliberately imports only the package installed in `node_modules`:

```tsx
import {
  GenomicFeatureBrowser,
  type GenomicDataset,
} from "genomic-feature-db-component";
import "genomic-feature-db-component/styles.css";
```

It never imports files from `ui-component/src`. This separation proves that the
package's public exports, declarations, CSS, database worker, SQLite WASM, and
JBrowse dependencies continue to work after `npm pack`.

## What it verifies

The automated browser journey checks:

- installation from the local npm tarball;
- one shared React installation;
- TypeScript declaration resolution and a production Vite build;
- package CSS isolation from host page styles;
- database worker and SQLite WASM loading;
- HTTP Range access to the SQLite database;
- search and 25-result pagination;
- the public feature-selection callback;
- JBrowse navigation to the selected feature;
- one-based GFF to zero-based JBrowse highlight conversion; and
- replacement of the previous highlight when another feature is selected.

The same journey runs against both the Vite development server and the built
production preview.

## Run the complete package test

From `ui-component`:

```powershell
cd ui-component
npm.cmd run test:package
```

That command builds the component, creates and inspects its tarball, recreates
this consumer's dependencies, installs the tarball, typechecks and builds the
consumer, and runs both browser modes.

## Run the example manually

First create the tarball:

```powershell
cd ui-component
npm.cmd run pack:local
```

Then install it into this application and start Vite:

```powershell
cd ..\examples\package-consumer
npm.cmd ci
npm.cmd install --no-save --package-lock=false ..\..\ui-component\package-artifacts\genomic-feature-db-component-0.1.0.tgz
npm.cmd run dev -- --host 127.0.0.1 --port 4180
```

Open <http://127.0.0.1:4180>, search for `MGYG000490722_1`, load another page,
and select `MGYG000490722_00001` followed by `MGYG000490722_00002` to observe
JBrowse navigation and highlight replacement.

If the tarball is already installed, run the development browser test with:

```powershell
npm.cmd run test:e2e
```

Run the production journey after building the consumer:

```powershell
npm.cmd run build
$env:PACKAGE_CONSUMER_PREVIEW = "1"
npm.cmd run test:e2e
Remove-Item Env:PACKAGE_CONSUMER_PREVIEW
```

## Test data and real consumers

`dev/sampleDataPlugin.ts` serves the repository's existing `sample_data`
fixture and implements byte-range responses for local tests. It is not part of
the component package and should not be copied into a production application.

A real consumer supplies its own `GenomicDataset` URLs for the raw SQLite
database, FASTA, FAI, BGZF GFF, and TBI/CSI index. Its asset server must preserve
the raw bytes, support HTTP Range requests, and expose the required range and
validator headers through CORS.

The tested Vite worker and dependency-optimization settings are documented in
`vite.config.ts`. Applications using another bundler require separate
compatibility testing.

## Directory guide

- `src/main.tsx` is the copyable public-package usage example.
- `src/host.css` provides host-owned styles used by the isolation check.
- `vite.config.ts` configures the ESM worker, SQLite WASM, and JBrowse for Vite.
- `dev/sampleDataPlugin.ts` is the local Range-capable data server.
- `e2e/package-consumer.spec.ts` contains the critical browser journey.
- `e2e/testServer.ts` starts and stops Vite for Playwright.
- `playwright.config.ts` runs development and production-preview modes.
- `package.json` and `package-lock.json` define a reproducible clean consumer.

## Generated files

Do not commit these generated directories or files:

```text
node_modules/
dist/
test-results/
playwright-report/
*.tsbuildinfo
```

They are ignored by the repository. The generated package tarball under
`ui-component/package-artifacts/` is also local-only and must not be committed.

The supported release target is Node 22. Other Node versions may emit an engine
warning even when the local test succeeds.
