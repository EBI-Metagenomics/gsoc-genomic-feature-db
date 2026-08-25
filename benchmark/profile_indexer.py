#!/usr/bin/env python3
"""Profile GFF characteristics and fresh GFF-to-SQLite indexer processes."""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import platform
import re
import sys
import tempfile
import time
from typing import Any

try:
    import psutil
except ImportError as exc:  # pragma: no cover - exercised by CLI installations
    raise SystemExit(
        "psutil is required; install benchmark/requirements.txt before profiling"
    ) from exc

from benchmarklib import (
    ManifestError,
    ROLES,
    load_manifest,
    resolve_dataset_path,
    select_datasets,
    sha256_file,
    uncompressed_size,
    verify_dataset,
)

BENCHMARK_DIR = Path(__file__).resolve().parent
REPOSITORY_ROOT = BENCHMARK_DIR.parent
SCRIPTS_DIR = REPOSITORY_ROOT / "scripts"
INDEXER = SCRIPTS_DIR / "indexer.py"
RESULT_SCHEMA_VERSION = 1
DATASET_ID_RE = re.compile(r"^[A-Za-z0-9_.-]+$")

sys.path.insert(0, str(SCRIPTS_DIR))
from parser import GFFParser  # noqa: E402


def portable_path(path: Path) -> str:
    resolved = path.expanduser().resolve()
    try:
        return resolved.relative_to(REPOSITORY_ROOT).as_posix()
    except ValueError:
        return resolved.as_posix()


def portable_command(command: list[str]) -> list[str]:
    return [
        portable_path(Path(value)) if Path(value).is_absolute() else value
        for value in command
    ]


def normalize_indexer_paths(statistics: dict[str, Any]) -> None:
    for input_details in statistics.get("inputs", []):
        if input_details.get("path"):
            input_details["path"] = portable_path(Path(input_details["path"]))
    output = statistics.get("output", {})
    if output.get("path"):
        output["path"] = portable_path(Path(output["path"]))


def sorted_counter(counter: Counter[str]) -> dict[str, int]:
    return dict(sorted(counter.items(), key=lambda item: item[0].lower()))


def profile_source(path: Path, record_limit: int | None = None) -> dict[str, Any]:
    """Stream source-level GFF characteristics without retaining feature rows."""
    sequence_ids: set[str] = set()
    feature_types: Counter[str] = Counter()
    annotation_fields: Counter[str] = Counter()
    feature_rows = 0
    malformed_rows = 0
    stopped_at_fasta = False

    with GFFParser.open_gff_text(str(path)) as handle:
        for line in handle:
            if line.startswith(("##FASTA", ">")):
                stopped_at_fasta = True
                break
            if not line or line.startswith("#") or line.isspace():
                continue
            columns = line.rstrip("\r\n").split("\t")
            if len(columns) < 9:
                malformed_rows += 1
                continue
            feature_rows += 1
            sequence_ids.add(columns[0])
            feature_types[columns[2]] += 1
            for field in GFFParser.parse_attributes(columns[8]):
                annotation_fields[field] += 1
            if record_limit is not None and feature_rows >= record_limit:
                break

    return {
        "feature_rows": feature_rows,
        "malformed_rows": malformed_rows,
        "distinct_sequences": len(sequence_ids),
        "feature_type_distribution": sorted_counter(feature_types),
        "annotation_field_distribution": sorted_counter(annotation_fields),
        "stopped_at_fasta": stopped_at_fasta,
        "record_limit": record_limit,
        "complete": record_limit is None,
    }


def process_tree_rss(process: psutil.Process) -> int:
    total = 0
    processes = [process]
    try:
        processes.extend(process.children(recursive=True))
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass
    for candidate in processes:
        try:
            total += candidate.memory_info().rss
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return total


def run_indexer(
    dataset: dict[str, Any],
    input_path: Path,
    work_dir: Path,
    python_executable: str,
    limit: int | None,
    vacuum: bool,
    prefix: bool,
    sample_interval: float,
) -> dict[str, Any]:
    work_key = dataset["role"] if dataset["role"] in ROLES else dataset["id"]
    dataset_work = work_dir / work_key
    dataset_work.mkdir(parents=True, exist_ok=True)
    database_path = dataset_work / f"{dataset['id']}.db.zip"
    statistics_path = dataset_work / "indexer-stats.json"
    stdout_path = dataset_work / "indexer.stdout.log"
    stderr_path = dataset_work / "indexer.stderr.log"
    command = [
        python_executable,
        str(INDEXER),
        str(input_path),
        "--output",
        str(database_path),
        "--stats-json",
        str(statistics_path),
    ]
    if limit is not None:
        command.extend(["--limit", str(limit)])
    if not vacuum:
        command.append("--no-vacuum")
    if prefix:
        command.append("--prefix")

    started_at = datetime.now(timezone.utc)
    started = time.perf_counter()
    peak_rss_bytes = 0
    with stdout_path.open("w", encoding="utf-8") as stdout, stderr_path.open(
        "w", encoding="utf-8"
    ) as stderr:
        process = psutil.Popen(
            command,
            cwd=REPOSITORY_ROOT,
            stdout=stdout,
            stderr=stderr,
            text=True,
        )
        while process.is_running():
            peak_rss_bytes = max(peak_rss_bytes, process_tree_rss(process))
            try:
                process.wait(timeout=sample_interval)
            except psutil.TimeoutExpired:
                continue
            break
        peak_rss_bytes = max(peak_rss_bytes, process_tree_rss(process))
        return_code = process.wait()
    wall_seconds = time.perf_counter() - started

    if return_code != 0:
        stderr_tail = stderr_path.read_text(encoding="utf-8", errors="replace")[-4000:]
        raise RuntimeError(
            f"Indexer failed for {dataset['id']} with exit code {return_code}:\n{stderr_tail}"
        )
    try:
        indexer_statistics = json.loads(statistics_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(
            f"Indexer did not produce valid statistics for {dataset['id']}: {exc}"
        ) from exc
    normalize_indexer_paths(indexer_statistics)

    return {
        "command": portable_command(command),
        "started_at": started_at.isoformat(),
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "external_wall_seconds": round(wall_seconds, 6),
        "peak_process_tree_rss_bytes": peak_rss_bytes,
        "sample_interval_seconds": sample_interval,
        "return_code": return_code,
        "indexer": indexer_statistics,
        "diagnostic_logs": {
            "stdout": portable_path(stdout_path),
            "stderr": portable_path(stderr_path),
        },
    }


def environment_summary() -> dict[str, Any]:
    memory = psutil.virtual_memory()
    frequency = psutil.cpu_freq()
    return {
        "platform": platform.platform(),
        "operating_system": platform.system(),
        "operating_system_release": platform.release(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "logical_cpu_count": psutil.cpu_count(logical=True),
        "physical_cpu_count": psutil.cpu_count(logical=False),
        "cpu_frequency_mhz": round(frequency.current, 2) if frequency else None,
        "total_memory_bytes": memory.total,
        "python_version": platform.python_version(),
        "python_executable": portable_path(Path(sys.executable)),
        "psutil_version": psutil.__version__,
    }


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        newline="\n",
        prefix=f".{path.name}.",
        suffix=".tmp",
        dir=path.parent,
        delete=False,
    ) as handle:
        temporary = Path(handle.name)
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def inferred_dataset_id(path: Path) -> str:
    name = path.name
    for suffix in (".gff3.gz", ".gff.gz", ".gff3.bgz", ".gff.bgz", ".gff3", ".gff"):
        if name.lower().endswith(suffix):
            return name[: -len(suffix)]
    return path.stem


def local_dataset(
    path: Path, dataset_id: str | None
) -> tuple[dict[str, Any], Path, dict[str, Any]]:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise ManifestError(f"Custom input is missing or is not a file: {resolved}")
    identifier = dataset_id or inferred_dataset_id(resolved)
    if not DATASET_ID_RE.fullmatch(identifier):
        raise ManifestError(
            "Custom dataset id must contain only letters, numbers, '.', '_' or '-'"
        )
    details = {
        "compressed_bytes": resolved.stat().st_size,
        "uncompressed_bytes": uncompressed_size(resolved),
        "sha256": sha256_file(resolved),
    }
    return (
        {
            "id": identifier,
            "role": "custom",
            "description": f"Local benchmark input {resolved.name}",
            "source_url": None,
        },
        resolved,
        details,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group()
    source.add_argument(
        "--manifest",
        type=Path,
        help="Dataset manifest (default: benchmark/datasets.json).",
    )
    source.add_argument(
        "--input",
        type=Path,
        help="Benchmark one arbitrary local .gff/.gff3 file, optionally gzip-compressed.",
    )
    parser.add_argument(
        "--dataset-id", help="Stable identifier for --input (default: filename)."
    )
    parser.add_argument("--datasets", nargs="+", default=None)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--work-dir", type=Path, default=REPOSITORY_ROOT / "benchmark-work"
    )
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--no-vacuum", action="store_true")
    parser.add_argument("--prefix", action="store_true")
    parser.add_argument("--sample-interval", type=float, default=0.05)
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be positive")
    if args.sample_interval <= 0:
        parser.error("--sample-interval must be positive")
    if args.dataset_id and args.input is None:
        parser.error("--dataset-id requires --input")
    if args.input is not None and args.datasets is not None:
        parser.error("--datasets cannot be combined with --input")

    try:
        if args.input is not None:
            selected_inputs = [local_dataset(args.input, args.dataset_id)]
            manifest_path = None
            input_mode = "local"
        else:
            manifest_path = args.manifest or BENCHMARK_DIR / "datasets.json"
            selected = select_datasets(
                load_manifest(manifest_path), args.datasets or ["all"]
            )
            selected_inputs = [
                (
                    dataset,
                    input_path := resolve_dataset_path(dataset, REPOSITORY_ROOT),
                    verify_dataset(dataset, input_path),
                )
                for dataset in selected
            ]
            input_mode = "manifest"
        run_type = "smoke" if args.limit is not None or args.no_vacuum else "baseline"
        result: dict[str, Any] = {
            "result_schema_version": RESULT_SCHEMA_VERSION,
            "run_type": run_type,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "input_mode": input_mode,
            "manifest": portable_path(manifest_path) if manifest_path else None,
            "configuration": {
                "limit": args.limit,
                "vacuum": not args.no_vacuum,
                "prefix_index": args.prefix,
                "sample_interval_seconds": args.sample_interval,
            },
            "environment": environment_summary(),
            "datasets": [],
        }
        for dataset, input_path, verified in selected_inputs:
            print(f"Profiling source characteristics: {dataset['id']}", flush=True)
            source = profile_source(input_path, record_limit=args.limit)
            print(f"Running fresh indexer process: {dataset['id']}", flush=True)
            index_run = run_indexer(
                dataset=dataset,
                input_path=input_path,
                work_dir=args.work_dir,
                python_executable=args.python,
                limit=args.limit,
                vacuum=not args.no_vacuum,
                prefix=args.prefix,
                sample_interval=args.sample_interval,
            )
            result["datasets"].append(
                {
                    "id": dataset["id"],
                    "role": dataset["role"],
                    "description": dataset["description"],
                    "source_url": dataset["source_url"],
                    "input_path": portable_path(input_path),
                    "input": verified,
                    "source_characteristics": source,
                    "index_run": index_run,
                }
            )
            write_json(args.output, result)
        print(f"Wrote {run_type} results to {args.output}")
        return 0
    except (ManifestError, OSError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
