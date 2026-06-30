#!/usr/bin/env python3
import argparse
import os
import sys
import time

from config import BATCH_SIZE
from database import DatabaseBuilder, FeatureRepository, DatabaseVerifier
from parser import GFFParser
from utils import get_logger, get_db_size_mb

logger = get_logger("indexer")


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

    logger.info(f"Creating compact FTS-only database: {db_path}")

    builder = DatabaseBuilder(db_path, use_prefix)
    conn = builder.prepare()
    repo = FeatureRepository(conn)
    verifier = DatabaseVerifier(conn)

    conn.execute("BEGIN;")

    parsed_features = 0
    indexed_rows = 0
    skipped_rows = 0
    generated_id = 1
    meta_batch = []
    fts_batch = []

    try:
        for gff_path in gff_paths:
            logger.info(f"Reading: {gff_path}")

            if not os.path.exists(gff_path):
                raise FileNotFoundError(f"Input file not found: {gff_path}")

            with GFFParser.open_gff_text(gff_path) as handle:
                for line in handle:
                    if limit is not None and parsed_features >= limit:
                        break

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

    except Exception:
        conn.rollback()
        conn.close()
        raise

    conn.close()

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
        default=os.path.join(
            os.path.dirname(__file__),
            "..",
            "database",
            "genomics.db.zip",
        ),
        help="Output DB path. Default: ../database/genomics.db.zip",
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

    try:
        build_database(
            gff_paths=args.gff,
            db_path=args.output,
            use_prefix=args.prefix,
            vacuum=not args.no_vacuum,
            limit=args.limit,
        )
    except Exception as exc:
        logger.error(f"ERROR: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
