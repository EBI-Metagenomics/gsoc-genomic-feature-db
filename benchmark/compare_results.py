#!/usr/bin/env python3
"""Compare the committed benchmark baseline with Issue 13 final results."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys
from typing import Any, Iterable

REGRESSION_THRESHOLD = 20.0


class ComparisonError(ValueError):
    """Raised when baseline and final measurements are not comparable."""


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ComparisonError(f"Cannot read {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ComparisonError(f"Expected a JSON object in {path}")
    return value


def percentile(values: Iterable[float], fraction: float) -> float:
    ordered = sorted(float(value) for value in values)
    if not ordered:
        raise ComparisonError("Cannot calculate a percentile from no samples")
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)]


def browser_by_role(results: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_role: dict[str, dict[str, Any]] = {}
    for result in results:
        role = result.get("dataset_role")
        if role not in {"small", "medium", "large"}:
            raise ComparisonError(f"Unexpected browser dataset role: {role!r}")
        if role in by_role:
            raise ComparisonError(f"Duplicate browser result for {role}")
        by_role[role] = result
    if set(by_role) != {"small", "medium", "large"}:
        raise ComparisonError("Browser results must contain small, medium and large")
    return by_role


def indexer_by_role(result: dict[str, Any]) -> dict[str, dict[str, Any]]:
    by_role = {dataset["role"]: dataset for dataset in result.get("datasets", [])}
    if set(by_role) != {"small", "medium", "large"}:
        raise ComparisonError("Indexer results must contain small, medium and large")
    return by_role


def require_equal(label: str, baseline: Any, final: Any) -> None:
    if baseline != final:
        raise ComparisonError(
            f"{label} differs: baseline={baseline!r}, final={final!r}"
        )


def validate_comparability(
    baseline_indexer: dict[str, Any],
    final_indexer: dict[str, Any],
    baseline_browsers: dict[str, dict[str, Any]],
    final_browsers: dict[str, dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    if baseline_indexer.get("run_type") != "baseline":
        raise ComparisonError("Indexer baseline is not a formal run")
    if final_indexer.get("run_type") != "baseline":
        raise ComparisonError("Final indexer result is not a formal run")
    if final_indexer.get("benchmark_phase") != "final":
        raise ComparisonError(
            "Final indexer result is not labelled benchmark_phase=final"
        )

    baseline_datasets = indexer_by_role(baseline_indexer)
    final_datasets = indexer_by_role(final_indexer)
    require_equal(
        "indexer configuration",
        baseline_indexer.get("configuration"),
        final_indexer.get("configuration"),
    )
    for key in (
        "platform",
        "python_version",
        "logical_cpu_count",
        "physical_cpu_count",
    ):
        require_equal(
            f"indexer environment {key}",
            baseline_indexer.get("environment", {}).get(key),
            final_indexer.get("environment", {}).get(key),
        )
    for role in ("small", "medium", "large"):
        baseline = baseline_datasets[role]
        final = final_datasets[role]
        require_equal(f"{role} dataset id", baseline.get("id"), final.get("id"))
        for key in ("sha256", "compressed_bytes", "uncompressed_bytes"):
            require_equal(
                f"{role} input {key}",
                baseline.get("input", {}).get(key),
                final.get("input", {}).get(key),
            )

        baseline_browser = baseline_browsers[role]
        final_browser = final_browsers[role]
        if baseline_browser.get("run_type") != "baseline":
            raise ComparisonError(f"{role} browser baseline is not a formal run")
        if final_browser.get("run_type") != "baseline":
            raise ComparisonError(f"{role} final browser result is not a formal run")
        if final_browser.get("benchmark_phase") != "final":
            raise ComparisonError(
                f"{role} final browser result is not labelled benchmark_phase=final"
            )
        require_equal(
            f"{role} browser configuration",
            baseline_browser.get("configuration"),
            final_browser.get("configuration"),
        )
        require_equal(
            f"{role} query manifest",
            baseline_browser.get("query_manifest"),
            final_browser.get("query_manifest"),
        )
        require_equal(
            f"{role} Node version",
            baseline_browser.get("environment", {}).get("node_version"),
            final_browser.get("environment", {}).get("node_version"),
        )
        baseline_queries = {
            (sample["cache_state"], sample["category"], sample["query"])
            for sample in baseline_browser.get("searches", [])
        }
        final_queries = {
            (sample["cache_state"], sample["category"], sample["query"])
            for sample in final_browser.get("searches", [])
        }
        require_equal(f"{role} browser query matrix", baseline_queries, final_queries)
    return baseline_datasets, final_datasets


def change_percent(baseline: float, final: float) -> float:
    if baseline == 0:
        return 0.0 if final == 0 else math.inf
    return ((final - baseline) / baseline) * 100.0


def fmt_number(value: float, unit: str) -> str:
    if unit == "MiB":
        return f"{value / 1048576:.2f} MiB"
    if unit == "s":
        return f"{value:.2f} s"
    if unit == "count":
        return f"{value:.0f}"
    return f"{value:.1f} ms"


def comparison_rows(
    baseline_datasets: dict[str, dict[str, Any]],
    final_datasets: dict[str, dict[str, Any]],
    baseline_browsers: dict[str, dict[str, Any]],
    final_browsers: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for role in ("small", "medium", "large"):
        baseline_index = baseline_datasets[role]["index_run"]
        final_index = final_datasets[role]["index_run"]
        index_metrics = (
            (
                "indexing_time",
                "Indexing time",
                "s",
                baseline_index["external_wall_seconds"],
                final_index["external_wall_seconds"],
            ),
            (
                "peak_indexing_memory",
                "Peak indexing memory",
                "MiB",
                baseline_index["peak_process_tree_rss_bytes"],
                final_index["peak_process_tree_rss_bytes"],
            ),
            (
                "database_size",
                "Database size",
                "MiB",
                baseline_index["indexer"]["output"]["size_bytes"],
                final_index["indexer"]["output"]["size_bytes"],
            ),
        )
        baseline_browser = baseline_browsers[role]
        final_browser = final_browsers[role]
        browser_metrics = (
            (
                "initial_load_p95",
                "Initial browser load p95",
                "ms",
                percentile(
                    (x["page_ready_ms"] for x in baseline_browser["initialisation"]),
                    0.95,
                ),
                percentile(
                    (x["page_ready_ms"] for x in final_browser["initialisation"]), 0.95
                ),
            ),
            (
                "initial_bytes_p95",
                "Initial bytes transferred p95",
                "MiB",
                percentile(
                    (x["bytes"] for x in baseline_browser["initialisation"]), 0.95
                ),
                percentile((x["bytes"] for x in final_browser["initialisation"]), 0.95),
            ),
            (
                "search_latency_p95",
                "Visible search latency p95",
                "ms",
                percentile(
                    (x["visible_results_ms"] for x in baseline_browser["searches"]),
                    0.95,
                ),
                percentile(
                    (x["visible_results_ms"] for x in final_browser["searches"]), 0.95
                ),
            ),
            (
                "search_bytes_p95",
                "Search bytes transferred p95",
                "MiB",
                percentile((x["bytes"] for x in baseline_browser["searches"]), 0.95),
                percentile((x["bytes"] for x in final_browser["searches"]), 0.95),
            ),
            (
                "browser_memory_p95",
                "Browser JS heap p95",
                "MiB",
                percentile(
                    (x["js_heap_used_bytes"] for x in baseline_browser["searches"]),
                    0.95,
                ),
                percentile(
                    (x["js_heap_used_bytes"] for x in final_browser["searches"]), 0.95
                ),
            ),
            (
                "main_thread_p95",
                "Main-thread long-task duration p95",
                "ms",
                percentile(
                    (x["long_task_duration_ms"] for x in baseline_browser["searches"]),
                    0.95,
                ),
                percentile(
                    (x["long_task_duration_ms"] for x in final_browser["searches"]),
                    0.95,
                ),
            ),
        )
        for key, label, unit, baseline, final in (*index_metrics, *browser_metrics):
            delta = change_percent(float(baseline), float(final))
            rows.append(
                {
                    "key": f"{role}.{key}",
                    "role": role,
                    "metric": label,
                    "unit": unit,
                    "baseline": float(baseline),
                    "final": float(final),
                    "delta": delta,
                    "regression": delta > REGRESSION_THRESHOLD,
                }
            )
    return rows


def render_report(
    rows: list[dict[str, Any]],
    baseline_indexer: dict[str, Any],
    final_indexer: dict[str, Any],
    baseline_browsers: dict[str, dict[str, Any]],
    final_browsers: dict[str, dict[str, Any]],
    analysis: dict[str, Any],
) -> tuple[str, list[str]]:
    explanations = analysis.get("regressions", {})
    unexplained = [
        row["key"]
        for row in rows
        if row["regression"] and not explanations.get(row["key"])
    ]
    baseline_runtime = baseline_indexer["datasets"][0]["index_run"]["indexer"][
        "environment"
    ]
    final_runtime = final_indexer["datasets"][0]["index_run"]["indexer"]["environment"]
    lines = [
        "# Issue 13 final benchmark comparison",
        "",
        "Status: **formal final comparison**.",
        "",
        "The committed Issue 14 baseline is compared with a fresh run of the final implementation. Positive deltas are slower/larger; changes above 20% require an explanation and mentor review.",
        "",
        "## Environment",
        "",
        f"- Baseline commit: `{baseline_runtime.get('git_commit')}`",
        f"- Final commit: `{final_runtime.get('git_commit')}`",
        f"- Platform: `{final_indexer.get('environment', {}).get('platform')}`",
        f"- Python: `{final_indexer.get('environment', {}).get('python_version')}`",
        f"- CPU-frequency snapshot: baseline `{baseline_indexer.get('environment', {}).get('cpu_frequency_mhz')} MHz`; final `{final_indexer.get('environment', {}).get('cpu_frequency_mhz')} MHz`",
        f"- Node.js: `{final_browsers['small'].get('environment', {}).get('node_version')}`",
        f"- Baseline browser: `{baseline_browsers['small'].get('environment', {}).get('browser_version')}`",
        f"- Final browser: `{final_browsers['small'].get('environment', {}).get('browser_version')}`",
        "",
        "## Results",
        "",
        "| Dataset | Metric | Baseline | Final | Change | Assessment |",
        "|---|---|---:|---:|---:|---|",
    ]
    for row in rows:
        delta = "∞" if math.isinf(row["delta"]) else f"{row['delta']:+.1f}%"
        if row["regression"]:
            assessment = (
                "explained; mentor review"
                if explanations.get(row["key"])
                else "explanation required"
            )
        else:
            assessment = "within threshold"
        lines.append(
            f"| {row['role']} | {row['metric']} | {fmt_number(row['baseline'], row['unit'])} | {fmt_number(row['final'], row['unit'])} | {delta} | {assessment} |"
        )

    lines.extend(["", "## Unexpected or negative results", ""])
    regressions = [row for row in rows if row["regression"]]
    if not regressions:
        lines.append("No measured metric regressed by more than 20%.")
    else:
        for row in regressions:
            explanation = explanations.get(
                row["key"], "**TODO: add an evidence-based explanation.**"
            )
            lines.append(f"- `{row['key']}` ({row['delta']:+.1f}%): {explanation}")
    for note in analysis.get("unexpected_results", []):
        lines.append(f"- {note}")

    lines.extend(
        [
            "",
            "## Methodology and limitations",
            "",
            "- Dataset identities, sizes and SHA-256 checksums are identical between runs.",
            "- Indexer configuration, operating system, Python version and CPU topology are required to match.",
            "- Browser runs use the same query manifest, Node version, three cold repetitions and ten warm repetitions.",
            "- Browser patch versions may differ because the installed Edge/Chromium channel updates independently; both versions are recorded above.",
            "- Results are single-machine observations and include normal operating-system, filesystem-cache and antivirus noise.",
            "- Chromium JavaScript heap is not total browser RSS, and Long Tasks cover the page main thread rather than the SQLite worker.",
        ]
    )
    for limitation in analysis.get("limitations", []):
        lines.append(f"- {limitation}")
    lines.extend(
        [
            "",
            "## Acceptance check",
            "",
            "- [x] Baseline and final datasets and configurations are directly comparable.",
            "- [x] Indexing time, peak indexing memory and database size are compared.",
            "- [x] Loading time, transferred bytes, search latency, browser memory and main-thread responsiveness are compared.",
            f"- [{'x' if not unexplained else ' '}] Regressions above 20% have evidence-based explanations.",
            "",
        ]
    )
    return "\n".join(lines), unexplained


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-indexer", type=Path, required=True)
    parser.add_argument("--final-indexer", type=Path, required=True)
    parser.add_argument("--baseline-browser", type=Path, action="append", required=True)
    parser.add_argument("--final-browser", type=Path, action="append", required=True)
    parser.add_argument("--analysis", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        baseline_indexer = load_json(args.baseline_indexer)
        final_indexer = load_json(args.final_indexer)
        baseline_browsers = browser_by_role(
            [load_json(path) for path in args.baseline_browser]
        )
        final_browsers = browser_by_role(
            [load_json(path) for path in args.final_browser]
        )
        baseline_datasets, final_datasets = validate_comparability(
            baseline_indexer, final_indexer, baseline_browsers, final_browsers
        )
        rows = comparison_rows(
            baseline_datasets,
            final_datasets,
            baseline_browsers,
            final_browsers,
        )
        analysis = load_json(args.analysis) if args.analysis else {}
        report, unexplained = render_report(
            rows,
            baseline_indexer,
            final_indexer,
            baseline_browsers,
            final_browsers,
            analysis,
        )
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report, encoding="utf-8", newline="\n")
        print(f"Wrote final comparison to {args.output}")
        if unexplained:
            print(
                "ERROR: unexplained regressions: " + ", ".join(unexplained),
                file=sys.stderr,
            )
            return 1
        return 0
    except ComparisonError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
