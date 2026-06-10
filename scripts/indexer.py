#!/usr/bin/env python3
import argparse
import os
import sys
import time

from config import BATCH_SIZE
from database import DatabaseManager
from parser import GFFParser


def build_database(
    gff_paths: str | list[str],
    db_path: str,
    page_size: int = 4096,
    use_prefix: bool = False,
    vacuum: bool = True,
    limit: int | None = None,
) -> None:
    start_time = time.time()
    if isinstance(gff_paths, str):
        gff_paths = [gff_paths]

    print(f"[indexer] Creating compact FTS-only database: {db_path}")

    db_manager = DatabaseManager(db_path, page_size, use_prefix)

    parsed_features = 0
    indexed_rows = 0
    skipped_rows = 0
    generated_id = 1
    meta_batch = []
    fts_batch = []

    try:
        for gff_path in gff_paths:
            print(f"[indexer] Reading: {gff_path}")

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
                        db_manager.insert_batch(meta_batch, fts_batch)
                        meta_batch.clear()
                        fts_batch.clear()

                        if indexed_rows % 100_000 == 0:
                            print(f"[indexer] Indexed {indexed_rows:,} compact rows...")

            if limit is not None and parsed_features >= limit:
                break

        db_manager.insert_batch(meta_batch, fts_batch)
        db_manager.commit_and_optimize(vacuum=vacuum)
        db_manager.verify_database(expected_rows=indexed_rows)

    except Exception:
        db_manager.rollback()
        db_manager.close()
        raise

    db_manager.close()

    size_mb = os.path.getsize(db_path) / (1024 * 1024)

    print("[indexer] Done.")
    print(f"[indexer] Indexed searchable rows: {indexed_rows:,}")
    print(f"[indexer] Skipped low-value/invalid rows: {skipped_rows:,}")
    print(f"[indexer] Output: {db_path}")
    print(f"[indexer] DB size: {size_mb:.2f} MB")
    print(f"[indexer] Time elapsed: {time.time() - start_time:.2f} seconds")


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
        "--page-size",
        type=int,
        default=4096,
        help="SQLite page size. Default: 4096.",
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
            page_size=args.page_size,
            use_prefix=args.prefix,
            vacuum=not args.no_vacuum,
            limit=args.limit,
        )
    except Exception as exc:
        print(f"[indexer] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
