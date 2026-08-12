#!/usr/bin/env python3
import argparse
import os
import sqlite3
import sys
import tempfile
import time

from config import BATCH_SIZE
from parser import GFFParser
from utils import get_db_size_mb, get_logger

from database import DatabaseBuilder, DatabaseVerifier, FeatureRepository

logger = get_logger("indexer")


def default_output_path(gff_path: str) -> str:
    """Return an accession-specific raw SQLite path beside an input GFF."""
    lower_path = gff_path.lower()
    for suffix in (".gff3.gz", ".gff.gz", ".gff3", ".gff"):
        if lower_path.endswith(suffix):
            return f"{gff_path[: -len(suffix)]}.db.zip"
    raise ValueError(
        "Cannot derive output name: input must end in .gff, .gff3, "
        ".gff.gz, or .gff3.gz"
    )


def build_database(
    gff_paths: str | list[str],
    db_path: str,
    use_prefix: bool = False,
    vacuum: bool = True,
    limit: int | None = None,
) -> None:
    start_time = time.time()
    if isinstance(gff_paths, str):
        gff_paths = [gff_paths]

    for gff_path in gff_paths:
        if not os.path.isfile(gff_path):
            raise FileNotFoundError(f"Input file not found: {gff_path}")

    logger.info(f"Creating compact FTS-only database: {db_path}")

    output_dir = os.path.dirname(os.path.abspath(db_path))
    os.makedirs(output_dir, exist_ok=True)
    temp_fd, temp_path = tempfile.mkstemp(
        prefix=f".{os.path.basename(db_path)}.", suffix=".tmp", dir=output_dir
    )
    os.close(temp_fd)
    conn = None

    parsed_features = 0
    indexed_rows = 0
    skipped_rows = 0
    generated_id = 1
    meta_batch = []
    fts_batch = []

    try:
        builder = DatabaseBuilder(temp_path, use_prefix)
        conn = builder.prepare()
        repo = FeatureRepository(conn)
        verifier = DatabaseVerifier(conn)

        conn.execute("BEGIN;")
        for gff_path in gff_paths:
            logger.info(f"Reading: {gff_path}")

            with GFFParser.open_gff_text(gff_path) as handle:
                for line in handle:
                    if limit is not None and parsed_features >= limit:
                        break

                    if line.startswith(("##FASTA", ">")):
                        logger.info("Encountered FASTA section, stopping parser.")
                        break

                    if not line or line.startswith("#") or line.isspace():
                        continue

                    feature = GFFParser.parse_line(line, generated_id)

                    if feature is None:
                        skipped_rows += 1
                        continue

                    rowid = generated_id
                    meta_batch.append(feature.to_meta_tuple(rowid))
                    fts_batch.append(feature.to_fts_tuple(rowid))
                    generated_id += 1
                    parsed_features += 1
                    indexed_rows += 1

                    if len(meta_batch) >= BATCH_SIZE:
                        repo.insert_batch(meta_batch, fts_batch)
                        meta_batch.clear()
                        fts_batch.clear()

                        if indexed_rows % 100_000 == 0:
                            logger.info(f"Indexed {indexed_rows:,} compact rows...")

            if limit is not None and parsed_features >= limit:
                break

        repo.insert_batch(meta_batch, fts_batch)

        # Verify integrity before committing and optimizing
        verifier.verify(expected_rows=indexed_rows)

        repo.optimize(vacuum=vacuum)

        conn.close()
        conn = None
        os.replace(temp_path, db_path)

    except (Exception, KeyboardInterrupt):
        if conn is not None:
            try:
                conn.rollback()
            except sqlite3.Error:
                pass
            try:
                conn.close()
            except sqlite3.Error:
                pass
        try:
            os.remove(temp_path)
        except FileNotFoundError:
            pass
        raise

    size_mb = get_db_size_mb(db_path)

    logger.info("Done.")
    logger.info(f"Indexed searchable rows: {indexed_rows:,}")
    logger.info(f"Skipped low-value/invalid rows: {skipped_rows:,}")
    logger.info(f"Output: {db_path}")
    logger.info(f"DB size: {size_mb:.2f} MB")
    logger.info(f"Time elapsed: {time.time() - start_time:.2f} seconds")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a compact browser-friendly SQLite FTS5 index from GFF files."
    )

    parser.add_argument(
        "gff",
        nargs="+",
        help="One or more input files: .gff, .gff3, .gff.gz, .gff3.gz",
    )

    parser.add_argument(
        "-o",
        "--output",
        help="Output DB path. Defaults to {gff-name}.db.zip beside one input GFF.",
    )

    parser.add_argument(
        "--prefix",
        action="store_true",
        help="Enable prefix search. Increases DB size.",
    )

    parser.add_argument(
        "--no-vacuum",
        action="store_true",
        help="Skip final VACUUM.",
    )

    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit rows for testing.",
    )

    args = parser.parse_args()
    if args.output is None and len(args.gff) != 1:
        parser.error("--output is required when indexing multiple GFF files")

    try:
        output_path = args.output or default_output_path(args.gff[0])
        build_database(
            gff_paths=args.gff,
            db_path=output_path,
            use_prefix=args.prefix,
            vacuum=not args.no_vacuum,
            limit=args.limit,
        )
    except (OSError, RuntimeError, sqlite3.Error, ValueError) as exc:
        logger.error(f"ERROR: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
