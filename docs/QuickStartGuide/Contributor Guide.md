# Quick Start / Contributor Guide

## Set up a development checkout

Requirements: Python 3.10 or newer, Node.js 22.x, and npm. The indexer
uses the Python standard library; install `pytest`, Black, and Ruff only when
running the backend test and quality commands.

```powershell
git clone <repository-url>
cd gsoc-genomic-feature-db
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install pytest black ruff
cd ui-component
npm ci
```

Use `npm ci` for a reproducible frontend installation. The bundled
`MGYG000490722` demo data makes a separate genomic-data download unnecessary.
Read [the User Guide](../USAGE.md) before modifying or redistributing those
assets.

## Run the project

```powershell
cd ui-component
npm run dev
```

Use the URL printed by Vite and search for an identifier such as
`MGYG000490722_00001`. Selecting a result should navigate and highlight it in
JBrowse.

## Search scope and known limitations

The project is intentionally designed for compact, predictable discovery of
genomic features in a generated database. It is not a general-purpose SQL or
user-authored FTS query-language interface. User input is escaped and converted
to an all-field prefix search whose terms are combined with AND; `_` and `.` are
preserved as token characters. Complete-looking identifiers retain prefix
semantics, and results follow deterministic ingestion (`rowid`) order rather
than relevance ranking.

Known limitations are deliberate parts of this design:

- There is no raw Boolean, phrase, NEAR, fuzzy, stemming, or strict exact-match
  query mode.
- There is no production field selector, although the current `detail=column`
  schema retains an internal allow-listed column scope for verification and
  possible future use.
- BM25 relevance ranking is not used. Broad BM25 queries must score and sort the
  complete matching set before applying a page limit, increasing HTTP Range
  traffic and search latency compared with rowid keyset pagination.
- The UI reports rows loaded and whether more are available; it does not execute
  a separate global-count query. Counting every broad match would add database
  work and remote page requests before showing the total.
- Indexed annotations are bounded by the indexer's per-tag and length caps, so
  the search index is intentionally not an unlimited copy of every source
  attribute.

Enabling phrase or proximity queries would require positional token data such
as FTS5 `detail=full`. That would make generated databases and browser downloads
materially larger than the current `detail=column` design. Fuzzy or stemming
support would require additional tokenizer or index complexity. Exposing raw FTS
syntax would also introduce user-visible parsing errors and a more difficult
escaping and compatibility contract. These costs matter because SQLite pages
are fetched directly in the browser over HTTP rather than queried through a
server.

Do not enable one of these capabilities only because SQLite supports it. A
change should start from a demonstrated researcher need, define expected search
semantics, update the fixed quality fixture, and compare database size, HTTP
traffic, and latency. See [Search Semantics, Quality, and
Performance](../search-quality.md) for the authoritative behaviour, quality
matrix, performance evidence, and ranking decision.

## Validate a change

Run the checks that cover the area you changed, then run the full relevant suite
before opening a pull request.

| Area                           | Commands                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Python indexer                 | `.venv\Scripts\python.exe -m pytest`                                                                                      |
| Python formatting/linting      | `black --check scripts tests`; `ruff check scripts tests`                                                                 |
| Frontend unit and build checks | `cd ui-component`; `npm run typecheck`; `npm run lint`; `npm run format:check`; `npm test`; `npm run build`               |
| Chromium critical E2E          | `cd ui-component`; `npx playwright install chromium`; `npm run test:e2e -- e2e/genomic-search.spec.ts --project=chromium` |
| Firefox E2E                    | `cd ui-component`; `npx playwright install firefox`; `npm run test:e2e -- e2e/genomic-search.spec.ts --project=firefox`   |

CI executes the Python checks, frontend checks, and the Chromium critical E2E
workflow. Firefox is an expected local check before releases or after
browser-sensitive changes; WebKit is optional local validation.

## Working conventions

1. Create a focused branch and preserve unrelated work in a dirty checkout.
2. Keep Python code formatted with Black and linted with Ruff; keep TypeScript
   strict and formatted with Prettier.
3. Add or update tests with behaviour changes. For search-to-JBrowse changes,
   include the Chromium E2E flow when practical.
4. Do not add large genomic source files or generated databases to a pull
   request without agreement. Store reproducible commands, manifests, and
   checksums instead.
5. In the pull request, state the validation commands and results, including
   Firefox when it applies.

## Adding another demo dataset

Each registry entry must have a complete, internally consistent bundle: BGZF
GFF and `.tbi`, FASTA and `.fai`, plus a generated SQLite database. Sequence
names in the GFF and FASTA must match exactly because search-result `seqid` is
passed directly to JBrowse as `refName`. Configure deployment with raw byte
serving, HTTP Range support, and CORS as needed.
