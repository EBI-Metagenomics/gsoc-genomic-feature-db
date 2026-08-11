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

This writes `MGYG000490722.db.zip` beside the input. The `.zip` suffix is the
HTTP delivery name; the file contains raw SQLite bytes and is not a ZIP archive.
Every generated database contains one `database_metadata` row identifying its
schema and generator versions. Compatible browsers validate this contract before
querying feature data.

### Options

- `-o, --output`: Override both the default directory and filename. This is required
  when indexing multiple GFF inputs.
- `--prefix`: Enables prefix searching in FTS5 (increases database size).
- `--no-vacuum`: Skips the final SQLite VACUUM optimization (faster generation, but larger file size).
- `--limit`: Only parse N rows (useful for quick testing).

Verify a generated database by passing its path explicitly:

```bash
python verify_schema.py ../sample_data/MGYG000490722/MGYG000490722.db.zip
```

## Testing

Unit tests are written using `pytest`. To run the tests, ensure `pytest` is installed in your environment and run:

```bash
pytest test_indexer.py -v
```
