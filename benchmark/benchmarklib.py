"""Shared manifest and reporting utilities for Issue #14 benchmarks."""

from __future__ import annotations

import gzip
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request
from typing import Any, Iterable

ROLES = ("small", "medium", "large")
MANIFEST_SCHEMA_VERSION = 1


class ManifestError(ValueError):
    """Raised when the benchmark manifest or a local input is invalid."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def uncompressed_size(path: Path) -> int:
    opener = gzip.open if path.name.lower().endswith((".gz", ".bgz")) else Path.open
    size = 0
    if opener is gzip.open:
        handle = gzip.open(path, "rb")
    else:
        handle = path.open("rb")
    with handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            size += len(chunk)
    return size


def load_manifest(path: Path) -> list[dict[str, Any]]:
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ManifestError(f"Cannot read manifest {path}: {exc}") from exc
    if document.get("schema_version") != MANIFEST_SCHEMA_VERSION:
        raise ManifestError(
            f"Manifest schema_version must be {MANIFEST_SCHEMA_VERSION}"
        )
    datasets = document.get("datasets")
    if not isinstance(datasets, list) or not datasets:
        raise ManifestError("Manifest datasets must be a non-empty list")

    seen_ids: set[str] = set()
    seen_roles: set[str] = set()
    required = {
        "id",
        "role",
        "description",
        "source_url",
        "local_path",
        "sha256",
        "compressed_bytes",
        "uncompressed_bytes",
    }
    for dataset in datasets:
        if not isinstance(dataset, dict):
            raise ManifestError("Every dataset entry must be an object")
        missing = sorted(required - dataset.keys())
        if missing:
            raise ManifestError(
                f"Dataset {dataset.get('id', '<unknown>')} is missing: {', '.join(missing)}"
            )
        dataset_id = dataset["id"]
        role = dataset["role"]
        if not isinstance(dataset_id, str) or not dataset_id:
            raise ManifestError("Dataset id must be a non-empty string")
        if dataset_id in seen_ids:
            raise ManifestError(f"Duplicate dataset id: {dataset_id}")
        if role not in ROLES:
            raise ManifestError(f"Dataset {dataset_id} has invalid role: {role}")
        if role in seen_roles:
            raise ManifestError(f"Duplicate dataset role: {role}")
        if not str(dataset["source_url"]).startswith("https://"):
            raise ManifestError(f"Dataset {dataset_id} source_url must use HTTPS")
        if Path(dataset["local_path"]).is_absolute():
            raise ManifestError(f"Dataset {dataset_id} local_path must be relative")
        digest = dataset["sha256"]
        if (
            not isinstance(digest, str)
            or len(digest) != 64
            or any(character not in "0123456789abcdef" for character in digest)
        ):
            raise ManifestError(f"Dataset {dataset_id} has an invalid SHA-256")
        for size_name in ("compressed_bytes", "uncompressed_bytes"):
            size = dataset[size_name]
            if not isinstance(size, int) or size <= 0:
                raise ManifestError(f"Dataset {dataset_id} has invalid {size_name}")
        seen_ids.add(dataset_id)
        seen_roles.add(role)

    if seen_roles != set(ROLES):
        raise ManifestError(
            "Manifest must contain exactly small, medium and large roles"
        )
    return datasets


def select_datasets(
    datasets: list[dict[str, Any]], selectors: Iterable[str]
) -> list[dict[str, Any]]:
    requested = list(selectors)
    if not requested or requested == ["all"]:
        return datasets
    valid = {dataset["id"]: dataset for dataset in datasets}
    valid.update({dataset["role"]: dataset for dataset in datasets})
    selected: list[dict[str, Any]] = []
    seen: set[str] = set()
    for selector in requested:
        dataset = valid.get(selector)
        if dataset is None:
            raise ManifestError(
                f"Unknown dataset selector {selector!r}; use all, a role, or an id"
            )
        if dataset["id"] not in seen:
            selected.append(dataset)
            seen.add(dataset["id"])
    return selected


def resolve_dataset_path(dataset: dict[str, Any], repository_root: Path) -> Path:
    local_path = repository_root / dataset["local_path"]
    fixture_value = dataset.get("repository_fixture")
    fixture_path = repository_root / fixture_value if fixture_value else None
    if local_path.is_file():
        return local_path
    if fixture_path is not None and fixture_path.is_file():
        return fixture_path
    return local_path


def verify_dataset(
    dataset: dict[str, Any], path: Path, verify_uncompressed: bool = True
) -> dict[str, Any]:
    if not path.is_file():
        raise ManifestError(
            f"Dataset {dataset['id']} is missing at {path}. Run prepare_datasets.py first."
        )
    compressed_bytes = path.stat().st_size
    if compressed_bytes != dataset["compressed_bytes"]:
        raise ManifestError(
            f"Dataset {dataset['id']} size mismatch: expected "
            f"{dataset['compressed_bytes']} bytes, found {compressed_bytes}"
        )
    digest = sha256_file(path)
    if digest != dataset["sha256"]:
        raise ManifestError(
            f"Dataset {dataset['id']} checksum mismatch: expected "
            f"{dataset['sha256']}, found {digest}"
        )
    result = {"compressed_bytes": compressed_bytes, "sha256": digest}
    if verify_uncompressed:
        expanded = uncompressed_size(path)
        if expanded != dataset["uncompressed_bytes"]:
            raise ManifestError(
                f"Dataset {dataset['id']} uncompressed size mismatch: expected "
                f"{dataset['uncompressed_bytes']} bytes, found {expanded}"
            )
        result["uncompressed_bytes"] = expanded
    return result


def download_dataset(dataset: dict[str, Any], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.download")
    try:
        request = urllib.request.Request(
            dataset["source_url"],
            headers={"User-Agent": "gsoc-genomic-feature-db-benchmark/1"},
        )
        with urllib.request.urlopen(request) as response, temporary.open(
            "wb"
        ) as output:
            shutil.copyfileobj(response, output, length=1024 * 1024)
        verify_dataset(dataset, temporary)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
