# Production data integration

## Scope

`sample_data/` is a versioned local fixture for development, tests, and the
explicit bundled demonstration. It is not the production data source and is not
copied by the normal `npm run build` command.

The reusable browser component accepts one host-resolved `GenomicDataset`. It
does not assume an EMBL-EBI filesystem layout or call an undocumented service.
The production host application owns dataset discovery and supplies the five
HTTPS asset URLs.

## Recommended EMBL-EBI flow

```text
Authoritative EBI data source
        |
        | offline publication job (API/internal transfer as agreed by EBI)
        v
GFF + FASTA validation and indexing
        |-- indexer.py ----------> raw SQLite FTS5 .db.zip
        |-- bgzip + tabix -------> .gff.gz + .tbi/.csi
        `-- samtools faidx ------> .fna + .fna.fai
        |
        v
EBI HTTPS object storage or static data service
        |
        | exact URLs from a manifest/discovery API
        v
Host application --> GenomicDataset --> browser component
                                      |-- SQLite FTS5 HTTP ranges
                                      `-- JBrowse HTTP ranges
```

This separates three different concerns:

- An EBI API or manifest discovers accessions and returns published asset URLs.
- An offline EBI publication job prepares the search and genomic indexes.
- SQLite FTS5 executes feature searches locally in the browser; user queries do
  not require a server-side search API.

FTP, if EBI uses it internally as a source-transfer mechanism, belongs before
the publication step. The browser must receive the runtime assets over HTTPS;
it does not support an FTP runtime data path.

## Dataset contract

The host resolves an accession into the existing `GenomicDataset` interface:

```ts
const dataset = {
  accession: "MGYG000490722",
  databaseUrl: "https://data.example.ebi.ac.uk/.../MGYG000490722.db.zip",
  fastaUrl: "https://data.example.ebi.ac.uk/.../MGYG000490722.fna",
  fastaIndexUrl: "https://data.example.ebi.ac.uk/.../MGYG000490722.fna.fai",
  gffUrl: "https://data.example.ebi.ac.uk/.../MGYG000490722.gff.gz",
  gffIndexUrl: "https://data.example.ebi.ac.uk/.../MGYG000490722.gff.gz.tbi",
  gffIndexType: "TBI",
  initialLocation: "MGYG000490722_1:1..5000",
};
```

The URLs above are illustrative, not real EBI endpoints. The repository does
not yet contain an approved production endpoint or response schema. Those must
be agreed with the EBI service owner before an adapter is implemented.

A discovery API or static JSON manifest may return the same fields. Keeping the
response aligned with `GenomicDataset` prevents EBI-specific transport logic
from entering the search and JBrowse components.

## Publication requirements

For each accession, publish:

| Asset                              | Purpose                                                               |
| ---------------------------------- | --------------------------------------------------------------------- |
| `{accession}.db.zip`               | Raw SQLite database queried through HTTP VFS; it is not a ZIP archive |
| `{accession}.fna`                  | Reference sequence                                                    |
| `{accession}.fna.fai`              | Index generated from the exact deployed FASTA                         |
| `{accession}.gff.gz`               | BGZF-compressed annotations                                           |
| `{accession}.gff.gz.tbi` or `.csi` | Index generated from the exact deployed GFF                           |

The SQLite, GFF, and FASTA sequence identifiers must agree exactly. Publication
should be atomic: upload versioned files first, validate them, then expose the
new manifest entry. Immutable/versioned URLs are preferred so a database is
never combined with stale FASTA or GFF indexes.

The browser also validates the SQLite `database_metadata.schema_version` before
querying features. Schema changes are deployed by regenerating the immutable
database rather than migrating it in place. Publish a compatible browser and
database bundle together; an older or unversioned database is rejected with a
clear initialization error.

## HTTP range and CORS contract

The data service must support `GET`, `HEAD`, and single byte-range requests. A
valid range request must return `206 Partial Content`, `Accept-Ranges: bytes`,
`Content-Range`, and the requested `Content-Length`.

When the application and data use different origins, configure at least:

```http
Access-Control-Allow-Origin: https://<approved-application-origin>
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Allow-Headers: Range
Access-Control-Expose-Headers: Accept-Ranges, Content-Length, Content-Range
```

Same-origin deployments do not require CORS, but still require byte ranges.
Serve `.gff.gz` as raw BGZF bytes and do not add `Content-Encoding: gzip`, since
transparent decompression invalidates Tabix byte offsets.

## Build modes

From `ui-component/`:

- `npm run build` creates the normal production frontend and excludes
  `sample_data/`.
- `npm run build:demo` explicitly copies the local fixture into `dist/` for a
  self-contained demonstration.
- `npm run dev` and `npm run preview` serve the fixture directly from the
  workspace through development-only range middleware.
- `npm run deploy` intentionally uses `build:demo`, because that command deploys
  the repository demonstration rather than an EBI production instance.

An EBI deployment should use `npm run build` and publish genomic assets through
the approved data service. The host application should obtain or construct a
`GenomicDataset` and pass it to `GenomicFeatureBrowser`.

## Decisions still required from EBI

Before implementing a concrete production adapter, record:

1. The authoritative accession discovery API or manifest URL and schema.
2. The source location used by the offline publication job.
3. The HTTPS destination and stable/versioned URL convention.
4. Dataset refresh, retirement, and cache-invalidation rules.
5. Allowed application origins and the team responsible for CORS/range headers.
6. Authentication requirements, if the assets are not public.

Until these are provided, hard-coding a guessed EBI API or FTP endpoint would
create a false production contract.
