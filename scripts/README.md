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

To parse a `.gff` or `.gff.gz` file and generate the database:

```bash
python indexer.py ../sample_data/my_genomic_data.gff.gz -o ../database/genomics.db.zip
```

### Options

- `-o, --output`: Where to save the database. (Default: `../database/genomics.db.zip`)
- `--page-size`: SQLite page size. (Default: 4096)
- `--prefix`: Enables prefix searching in FTS5 (increases database size).
- `--no-vacuum`: Skips the final SQLite VACUUM optimization (faster generation, but larger file size).
- `--limit`: Only parse N rows (useful for quick testing).

## Testing

Unit tests are written using `pytest`. To run the tests, ensure `pytest` is installed in your environment and run:

```bash
pytest test_indexer.py -v
```
