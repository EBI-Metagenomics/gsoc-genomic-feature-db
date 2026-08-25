#!/usr/bin/env python3
"""Download or validate the canonical Issue #14 benchmark inputs."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

from benchmarklib import (
    ManifestError,
    download_dataset,
    load_manifest,
    resolve_dataset_path,
    select_datasets,
    verify_dataset,
)

BENCHMARK_DIR = Path(__file__).resolve().parent
REPOSITORY_ROOT = BENCHMARK_DIR.parent


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest", type=Path, default=BENCHMARK_DIR / "datasets.json"
    )
    parser.add_argument(
        "--datasets",
        nargs="+",
        default=["all"],
        help="Dataset roles or ids to prepare (default: all).",
    )
    parser.add_argument(
        "--download",
        action="store_true",
        help="Download missing inputs to their ignored local_path.",
    )
    parser.add_argument(
        "--no-uncompressed-check",
        action="store_true",
        help="Skip the slower full decompression size check.",
    )
    args = parser.parse_args()

    try:
        selected = select_datasets(load_manifest(args.manifest), args.datasets)
        for dataset in selected:
            path = resolve_dataset_path(dataset, REPOSITORY_ROOT)
            if not path.is_file() and args.download:
                path = REPOSITORY_ROOT / dataset["local_path"]
                print(f"Downloading {dataset['id']} to {path}", flush=True)
                download_dataset(dataset, path)
            details = verify_dataset(
                dataset, path, verify_uncompressed=not args.no_uncompressed_check
            )
            expanded = details.get("uncompressed_bytes", "not checked")
            print(
                f"{dataset['role']}: {dataset['id']} OK; "
                f"compressed={details['compressed_bytes']} bytes; "
                f"uncompressed={expanded} bytes; sha256={details['sha256']}"
            )
    except ManifestError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
