import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

import pytest

BENCHMARK_DIR = Path(__file__).parent.parent / "benchmark"
sys.path.insert(0, str(BENCHMARK_DIR))

from benchmarklib import (  # noqa: E402
    ManifestError,
    load_manifest,
    select_datasets,
    verify_dataset,
)
from generate_report import generate_report, percentile  # noqa: E402


def manifest_document(datasets):
    return {"schema_version": 1, "datasets": datasets}


def dataset_entry(role: str, dataset_id: str, path: Path, digest: str):
    return {
        "id": dataset_id,
        "role": role,
        "description": f"{role} fixture",
        "source_url": f"https://example.org/{dataset_id}.gff3",
        "local_path": f"benchmark-data/{dataset_id}.gff3",
        "repository_fixture": str(path),
        "sha256": digest,
        "compressed_bytes": path.stat().st_size,
        "uncompressed_bytes": path.stat().st_size,
    }


def write_manifest(tmp_path: Path, datasets) -> Path:
    path = tmp_path / "datasets.json"
    path.write_text(json.dumps(manifest_document(datasets)), encoding="utf-8")
    return path


def test_repository_manifest_defines_three_ordered_roles():
    datasets = load_manifest(BENCHMARK_DIR / "datasets.json")
    assert [dataset["role"] for dataset in datasets] == ["small", "medium", "large"]
    assert datasets[-1]["compressed_bytes"] > 100_000_000
    assert select_datasets(datasets, ["medium"])[0]["id"] == "GCF_000001215.4"


def test_manifest_rejects_duplicate_roles(tmp_path):
    fixture = tmp_path / "fixture.gff3"
    fixture.write_text("##gff-version 3\n", encoding="utf-8")
    digest = hashlib.sha256(fixture.read_bytes()).hexdigest()
    entries = [
        dataset_entry("small", "one", fixture, digest),
        dataset_entry("small", "two", fixture, digest),
        dataset_entry("large", "three", fixture, digest),
    ]

    with pytest.raises(ManifestError, match="Duplicate dataset role"):
        load_manifest(write_manifest(tmp_path, entries))


def test_verify_dataset_rejects_checksum_mismatch(tmp_path):
    fixture = tmp_path / "fixture.gff3"
    fixture.write_text("##gff-version 3\n", encoding="utf-8")
    entry = dataset_entry("small", "fixture", fixture, "0" * 64)

    with pytest.raises(ManifestError, match="checksum mismatch"):
        verify_dataset(entry, fixture)


def test_report_percentile_uses_nearest_rank_and_labels_smoke_data():
    assert percentile([1, 2, 3, 4, 5], 0.95) == 5
    report = generate_report(
        {
            "run_type": "smoke",
            "environment": {},
            "datasets": [],
        },
        [],
    )
    assert "Status: **partial/smoke evidence**" in report
    assert "No formal targets are proposed from smoke data" in report


@pytest.mark.skipif(
    importlib.util.find_spec("psutil") is None,
    reason="benchmark-only psutil dependency is not installed",
)
def test_profiler_smoke_run_emits_characteristics_memory_and_index_stats(tmp_path):
    fixture = tmp_path / "fixture.gff3"
    fixture.write_text(
        "##gff-version 3\n"
        "seq-A\tsource\tgene\t1\t4\t.\t+\t.\tID=one;Name=alpha;Dbxref=GeneID:1\n"
        "seq-B\tsource\tCDS\t5\t9\t.\t-\t0\tID=two;Name=beta;product=enzyme\n",
        encoding="utf-8",
    )
    digest = hashlib.sha256(fixture.read_bytes()).hexdigest()
    entries = [
        dataset_entry("small", "tiny", fixture, digest),
        dataset_entry("medium", "medium", fixture, digest),
        dataset_entry("large", "large", fixture, digest),
    ]
    manifest = write_manifest(tmp_path, entries)
    output = tmp_path / "smoke.json"
    work = tmp_path / "work"

    result = subprocess.run(
        [
            sys.executable,
            str(BENCHMARK_DIR / "profile_indexer.py"),
            "--manifest",
            str(manifest),
            "--datasets",
            "small",
            "--limit",
            "2",
            "--no-vacuum",
            "--work-dir",
            str(work),
            "--output",
            str(output),
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    payload = json.loads(output.read_text(encoding="utf-8"))
    assert payload["run_type"] == "smoke"
    assert len(payload["datasets"]) == 1
    measured = payload["datasets"][0]
    assert measured["source_characteristics"]["feature_rows"] == 2
    assert measured["source_characteristics"]["distinct_sequences"] == 2
    assert measured["source_characteristics"]["annotation_field_distribution"] == {
        "dbxref": 1,
        "id": 2,
        "name": 2,
        "product": 1,
    }
    assert measured["index_run"]["peak_process_tree_rss_bytes"] > 0
    assert measured["index_run"]["indexer"]["counts"]["indexed_rows"] == 2
    assert measured["index_run"]["indexer"]["output"]["size_bytes"] > 0


@pytest.mark.skipif(
    importlib.util.find_spec("psutil") is None,
    reason="benchmark-only psutil dependency is not installed",
)
def test_profiler_accepts_an_arbitrary_local_gff_without_a_manifest(tmp_path):
    fixture = tmp_path / "my-annotations.gff3"
    fixture.write_text(
        "##gff-version 3\n"
        "chr1\tsource\tgene\t1\t4\t.\t+\t.\tID=gene-123;Name=alpha\n",
        encoding="utf-8",
    )
    output = tmp_path / "custom.json"
    work = tmp_path / "work"

    result = subprocess.run(
        [
            sys.executable,
            str(BENCHMARK_DIR / "profile_indexer.py"),
            "--input",
            str(fixture),
            "--dataset-id",
            "my-dataset",
            "--work-dir",
            str(work),
            "--output",
            str(output),
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    payload = json.loads(output.read_text(encoding="utf-8"))
    assert payload["input_mode"] == "local"
    assert payload["manifest"] is None
    assert payload["run_type"] == "baseline"
    measured = payload["datasets"][0]
    assert measured["id"] == "my-dataset"
    assert measured["role"] == "custom"
    assert measured["input"]["compressed_bytes"] == fixture.stat().st_size
    assert measured["input"]["uncompressed_bytes"] == fixture.stat().st_size
    assert (
        measured["input"]["sha256"] == hashlib.sha256(fixture.read_bytes()).hexdigest()
    )
    assert measured["source_characteristics"]["feature_rows"] == 1
    assert (work / "my-dataset" / "my-dataset.db.zip").is_file()

    report = generate_report(payload, [])
    assert report.startswith("# GFF-to-SQLite performance benchmark")
    assert "This is a custom-dataset benchmark" in report
    assert "## Acceptance status" not in report
