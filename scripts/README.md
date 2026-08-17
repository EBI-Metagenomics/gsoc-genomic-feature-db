# Genomic Feature Indexer (`scripts/`)

This directory contains the Python backend tools for generating the highly-optimized FTS5 SQLite databases from `.gff` / `.gff3` genomic data files.

## Architecture

Based on the latest refactoring, the indexer has been modularized to use Object-Oriented patterns and typed dataclass models with post-build database verification:

- **`indexer.py`**: The main CLI entry point that coordinates parsing and database insertion.
- **`config.py`**: Contains all configurable constants and environment variables (e.g. batch sizes, feature types to ignore).
- **`models.py`**: Defines the `GenomicFeature` schema using a Python `dataclass`. This provides typed field documentation and structured tuple conversion for database insertion.
- **`parser.py`**: Contains `GFFParser`, a class dedicated to safely reading compressed or plain GFF files and converting attributes into valid models.
- **`database.py`**: Contains `DatabaseManager`, which handles SQLite schema creation, bulk insertions, the final FTS5 optimization (`ANALYZE`, `VACUUM`), and post-build database verification.

## Quick Setup

Make sure you have Python 3 installed. We strongly recommend using a virtual environment.

```bash
# No external dependencies required — uses only Python standard library
pip install -r requirements.txt
```

## Usage

To parse one `.gff`, `.gff3`, or gzip-compressed equivalent:

```bash
python indexer.py ../sample_data/MGYG000490722/MGYG000490722.gff.gz
```

This writes `MGYG000490722.db.zip` beside the input. The `.db.zip` filename is a
delivery convention to discourage automatic HTTP compression; the file contains
raw SQLite bytes and is not a ZIP archive.
Every generated database contains one `database_metadata` row identifying its
schema and generator versions. Compatible browsers validate this contract before
querying feature data.

### Options

- `-o, --output`: Override both the default directory and filename. This is required
  when indexing multiple GFF inputs.
- `--prefix`: Enables prefix searching in FTS5 (increases database size).
- `--no-vacuum`: Skips the final SQLite VACUUM optimization (faster generation, but larger file size).
- `--limit`: Only parse N rows (useful for quick testing).
- `--stats-json`: Write a stable JSON audit containing row counts, skipped
  reasons, complete build duration, configuration, environment versions, input
  hashes, and output size/hash. Normal CLI behaviour is unchanged when omitted.

Verify a generated database by passing its path explicitly:

```bash
python verify_schema.py ../sample_data/MGYG000490722/MGYG000490722.db.zip
```

Every successful run prints an audit summary containing the number of feature
rows examined, indexed and skipped; a skipped-row breakdown; distinct sequence
and feature-type counts; exact database bytes; and SHA-256 digests for every
input and the generated database. Use the output database size and digest in the
browser dataset configuration so complete-download fallback can reject truncated
or changed content. Hashing streams files in bounded chunks, so it does not load
large genomic files into memory.

## Testing

Unit and integration tests use `pytest`. From the repository root, install the
test tools and run the complete backend suite with:

```bash
python -m pip install pytest pytest-cov
python -m pytest -q
```

To record line coverage locally, including missing-line details and the XML
report produced by CI, run:

```bash
python -m pytest --cov=scripts --cov-report=term-missing --cov-report=xml
```

Coverage is diagnostic evidence, not a percentage gate or a substitute for the
schema, search-result, boundary, and failure-path assertions in the test suite.
CI records this report on Python 3.12 and uploads `coverage.xml` as the
`python-coverage-3.12` workflow artifact.

### Test data policy

Normal pull-request CI uses the bounded public fixture already committed under
`sample_data/` plus tiny GFF files created in temporary test directories. No
large-data test is currently excluded from the Issue #7 suite, and normal CI
does not download or generate large genomic datasets.

Optional large-dataset performance and profiling work belongs to Issue #14. It
must be run explicitly outside normal pull-request CI, using reproducible source
URLs/checksums and local generated artifacts rather than committing large inputs
or databases to this repository.
