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

Open the local URL printed by Vite (normally `http://localhost:5173`). Search
for at least three characters, select a result, and the embedded JBrowse view
navigates to and highlights that feature.

The local static server exposes the files in `sample_data/MGYG000490722/` under
the `/MGYG000490722/` URL path. A deployment needs the same five files, HTTP
byte-range support, and appropriate CORS headers when the application and data
use different origins.

## Regenerate the search database

The committed database is ready to use. To rebuild it from the bundled GFF:

```powershell
python scripts/indexer.py sample_data/MGYG000490722/MGYG000490722.gff.gz
```

This replaces the database beside the GFF. Do not commit a regenerated artifact
unless its change is intentional and reviewed.

## Browser support and E2E testing

Chromium-based browsers and Firefox are the supported/tested browsers. CI runs
the Chromium critical search-to-JBrowse workflow. Run Firefox locally before a
release or when changing browser-sensitive UI code. WebKit and performance
checks are optional local validation, not pull-request merge gates.

Install the supported Playwright browser binaries once per checkout:

```powershell
cd ui-component
npx playwright install chromium firefox
```

Run the critical test in each browser, or the full configured suite:

```powershell
npm run test:e2e -- e2e/genomic-search.spec.ts --project=chromium
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
