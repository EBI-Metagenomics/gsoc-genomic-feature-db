#!/usr/bin/env python3
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import os
import platform
import sqlite3
import subprocess
import sys
import tempfile
import time
from contextlib import suppress
from typing import Any

from config import BATCH_SIZE, GENERATOR_VERSION, SCHEMA_VERSION
from parser import GFFParser
from utils import get_db_size_mb, get_logger, sha256_file

from database import DatabaseBuilder, DatabaseVerifier, FeatureRepository

logger = get_logger("indexer")

SKIP_LABELS = {
    GFFParser.MALFORMED_COLUMNS: "malformed columns",
    GFFParser.MALFORMED_COORDINATES: "non-integer coordinates",
    GFFParser.FILTERED_LOW_VALUE: "low-value unannotated features",
    GFFParser.FILTERED_UNIDENTIFIED: "features without identity or annotation",
}

STATS_SCHEMA_VERSION = 1


def current_git_commit() -> str | None:
    """Return the repository commit when Git metadata is available."""
    repository_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=repository_root,
            capture_output=True,
            text=True,
            check=False,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    commit = result.stdout.strip()
    return commit if result.returncode == 0 and commit else None


def write_stats_json(path: str, statistics: dict[str, Any]) -> None:
    """Atomically write one stable, machine-readable indexing summary."""
    output_path = os.path.abspath(path)
    output_dir = os.path.dirname(output_path)
    os.makedirs(output_dir, exist_ok=True)
    temp_fd, temp_path = tempfile.mkstemp(
        prefix=f".{os.path.basename(output_path)}.", suffix=".tmp", dir=output_dir
    )
    try:
        with os.fdopen(temp_fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(statistics, handle, indent=2, sort_keys=True)
            handle.write("\n")
        os.replace(temp_path, output_path)
    except BaseException:
        with suppress(FileNotFoundError):
            os.remove(temp_path)
        raise


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
    stats_json_path: str | None = None,
) -> dict[str, Any]:
    started_at = datetime.now(timezone.utc)
    start_time = time.perf_counter()
    if isinstance(gff_paths, str):
        gff_paths = [gff_paths]

    for gff_path in gff_paths:
        if not os.path.isfile(gff_path):
            raise FileNotFoundError(f"Input file not found: {gff_path}")

    input_digests = {gff_path: sha256_file(gff_path) for gff_path in gff_paths}
    input_sizes = {gff_path: os.path.getsize(gff_path) for gff_path in gff_paths}

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
    examined_rows = 0
    generated_id = 1
    meta_batch = []
    fts_batch = []
    skip_reasons: Counter[str] = Counter()
    sequence_ids: set[str] = set()
    feature_types: Counter[str] = Counter()

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

                    examined_rows += 1
                    feature, skip_reason = GFFParser.parse_line_with_reason(
                        line, generated_id
                    )

                    if feature is None:
                        skipped_rows += 1
                        if skip_reason is not None:
                            skip_reasons[skip_reason] += 1
                        continue

                    rowid = generated_id
                    meta_batch.append(feature.to_meta_tuple(rowid))
                    fts_batch.append(feature.to_fts_tuple(rowid))
                    generated_id += 1
                    parsed_features += 1
                    indexed_rows += 1
                    sequence_ids.add(feature.seqid)
                    feature_types[feature.feature_type] += 1

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
            with suppress(sqlite3.Error):
                conn.rollback()
            with suppress(sqlite3.Error):
                conn.close()
        with suppress(FileNotFoundError):
            os.remove(temp_path)
        raise

    size_bytes = os.path.getsize(db_path)
    size_mb = get_db_size_mb(db_path)
    output_digest = sha256_file(db_path)
    feature_type_summary = (
        ", ".join(
            f"{feature_type}={count:,}"
            for feature_type, count in sorted(
                feature_types.items(), key=lambda item: (-item[1], item[0].lower())
            )
        )
        or "none"
    )
    skip_summary = ", ".join(
        f"{label}={skip_reasons[reason]:,}" for reason, label in SKIP_LABELS.items()
    )

    logger.info("Done.")
    logger.info(f"Feature rows examined: {examined_rows:,}")
    logger.info(f"Indexed searchable rows: {indexed_rows:,}")
    logger.info(f"Skipped rows: {skipped_rows:,} ({skip_summary})")
    logger.info(f"Distinct sequences: {len(sequence_ids):,}")
    logger.info(f"Indexed feature types: {feature_type_summary}")
    for input_path, digest in input_digests.items():
        logger.info(f"Input SHA-256 ({input_path}): {digest}")
    logger.info(f"Output: {db_path}")
    logger.info(f"DB size: {size_bytes:,} bytes ({size_mb:.2f} MB)")
    logger.info(f"Output SHA-256: {output_digest}")
    completed_at = datetime.now(timezone.utc)
    duration_seconds = time.perf_counter() - start_time
    statistics: dict[str, Any] = {
        "stats_schema_version": STATS_SCHEMA_VERSION,
        "started_at": started_at.isoformat(),
        "completed_at": completed_at.isoformat(),
        "duration_seconds": round(duration_seconds, 6),
        "inputs": [
            {
                "path": os.path.abspath(input_path),
                "size_bytes": input_sizes[input_path],
                "sha256": input_digests[input_path],
            }
            for input_path in gff_paths
        ],
        "output": {
            "path": os.path.abspath(db_path),
            "size_bytes": size_bytes,
            "sha256": output_digest,
        },
        "counts": {
            "feature_rows_examined": examined_rows,
            "indexed_rows": indexed_rows,
            "skipped_rows": skipped_rows,
            "distinct_sequences": len(sequence_ids),
        },
        "skip_reasons": {reason: skip_reasons[reason] for reason in SKIP_LABELS},
        "feature_type_distribution": dict(
            sorted(feature_types.items(), key=lambda item: item[0].lower())
        ),
        "configuration": {
            "batch_size": BATCH_SIZE,
            "limit": limit,
            "prefix_index": use_prefix,
            "vacuum": vacuum,
            "fts_optimize": True,
            "analyze": True,
            "verification_checks": 8,
        },
        "environment": {
            "python_version": platform.python_version(),
            "sqlite_version": sqlite3.sqlite_version,
            "platform": platform.platform(),
            "schema_version": SCHEMA_VERSION,
            "generator_version": GENERATOR_VERSION,
            "git_commit": current_git_commit(),
        },
    }
    if stats_json_path is not None:
        write_stats_json(stats_json_path, statistics)

    logger.info(f"Time elapsed: {duration_seconds:.2f} seconds")
    if stats_json_path is not None:
        logger.info(f"Statistics JSON: {stats_json_path}")
    return statistics


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

    parser.add_argument(
        "--stats-json",
        default=None,
        help="Write a stable machine-readable indexing summary to this path.",
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
            stats_json_path=args.stats_json,
        )
    except (OSError, RuntimeError, sqlite3.Error, ValueError) as exc:
        logger.error(f"ERROR: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
