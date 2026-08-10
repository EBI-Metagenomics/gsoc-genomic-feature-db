# User Guide

## Run the bundled demonstration

`MGYG000490722` is the supported demonstration dataset. Its complete runtime
bundle is already committed at `sample_data/MGYG000490722/`, so no data download
is needed for the local demo. The bundle contains:

- `MGYG000490722.gff.gz` and its Tabix index (`.tbi`)
- `MGYG000490722.fna` and its FASTA index (`.fai`)
- `MGYG000490722.db.zip`, the generated SQLite search database (despite the
  suffix, it contains raw SQLite bytes)

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

The local static server exposes the fixture in
`sample_data/MGYG000490722/` under the `/MGYG000490722/` URL path. The directory
name is not part of the browser URL. Both `npm run dev` and `npm run preview`
serve these files with byte-range responses. This is development/demo behavior,
not the production data architecture.

The normal `npm run build` excludes `sample_data/`. Use `npm run build:demo`
only when intentionally creating a self-contained demonstration. Production
must publish the five files through the approved HTTPS data service, with range
support and CORS when the application and data have different origins. See
[Production data integration](production-data-integration.md).

## Regenerate the search database

The committed database is ready to use. To rebuild it from the bundled GFF:

```powershell
python scripts/indexer.py sample_data/MGYG000490722/MGYG000490722.gff.gz
```

This replaces the database beside the GFF. Do not commit a regenerated artifact
unless its change is intentional and reviewed.

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
