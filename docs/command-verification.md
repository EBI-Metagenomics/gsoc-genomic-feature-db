# Clean-environment command verification

Issue 13 scopes “all documented commands” to development, formatting, testing,
building, package-consumer and benchmark commands. Deployment, registry
publishing, arbitrary user datasets and destructive fixture replacement are
examples rather than release gates.

## Automated clean checks

GitHub Actions starts from a fresh checkout for every job and installs locked
dependencies before running these groups:

| CI job | Clean-environment evidence |
|---|---|
| Python 3.10/3.12 | Black and Ruff over `scripts`, `tests` and `benchmark`; complete pytest suite and coverage. |
| Frontend | `npm ci`, typecheck, ESLint, Prettier check, Vitest, library build and demo build on Node 22. |
| E2E Chromium | Fresh `npm ci` and browser install; critical search, Range delivery/recovery and benchmark smoke journeys. |
| Clean packed-package consumer | Fresh `npm ci`, package tarball creation, isolated consumer install, typecheck, build, development E2E and production-preview E2E. |

The workflow file is `.github/workflows/ci.yml`. Record the successful workflow
URL and commit here before closing Issue 13:

- Commit: **pending final benchmark commit**
- Workflow: **pending**

## Manual release checks

Firefox remains a release check for browser-sensitive changes:

```powershell
cd ui-component
npx playwright install firefox
npm run test:e2e -- e2e/genomic-search.spec.ts --project=firefox
```

The full small/medium/large performance matrix is deliberately manual because
the large source expands to 3.48 GB and its generated database is about 1.31 GB.
Its exact command and result files are documented in `benchmark/README.md`; the
Issue 13 controlled result is `benchmark/final-report-performance.md`.

## Local evidence for this release

On Windows 11, the clean packed-package workflow was run manually with Node
22.23.2 and npm 10.9.8. Tarball creation, isolated installation, typechecking,
building, development Playwright and production-preview Playwright completed.
`npm ls react --all` reported the tarball as extraneous because it is installed
with `--no-save --package-lock=false`; it resolved exactly one React path and
exited successfully. The formal controlled final benchmark completed on the
same Windows 11 host with Node 26.4.0 and a 3040 MHz CPU-frequency snapshot,
matching the committed browser baseline. Its machine-readable results and
analysis are in `benchmark/results/*-performance.json`,
`benchmark/final-analysis-performance.json` and
`benchmark/final-report-performance.md`. An earlier lower-power run was
discarded after its CPU-frequency effect was documented in the controlled-run
analysis; it is not committed benchmark evidence.
