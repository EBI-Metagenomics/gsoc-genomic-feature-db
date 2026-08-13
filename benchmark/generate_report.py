#!/usr/bin/env python3
"""Generate the Issue #14 Markdown report from structured benchmark JSON."""

from __future__ import annotations

import argparse
from collections import defaultdict
import json
import math
from pathlib import Path
import statistics
from typing import Any, Iterable


def percentile(values: Iterable[float], quantile: float) -> float:
    ordered = sorted(float(value) for value in values)
    if not ordered:
        raise ValueError("Cannot calculate a percentile of an empty sequence")
    rank = max(1, math.ceil(quantile * len(ordered)))
    return ordered[rank - 1]


def summary(values: Iterable[float]) -> tuple[float, float]:
    collected = list(values)
    return statistics.median(collected), percentile(collected, 0.95)


def mib(value: int | float) -> str:
    return f"{float(value) / 1024**2:.2f} MiB"


def seconds(value: int | float) -> str:
    return f"{float(value):.2f} s"


def milliseconds(value: int | float) -> str:
    return f"{float(value):.1f} ms"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def render_indexer(indexer: dict[str, Any]) -> list[str]:
    lines = [
        "## Dataset and indexer baseline",
        "",
        "| Role | Dataset | Compressed GFF | Uncompressed GFF | Source features | Sequences | Indexed | Skipped | Index time | Peak RSS | SQLite size |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for dataset in indexer.get("datasets", []):
        source = dataset["source_characteristics"]
        run = dataset["index_run"]
        counts = run["indexer"]["counts"]
        lines.append(
            "| {role} | `{id}` | {compressed} | {uncompressed} | {features:,} | "
            "{sequences:,} | {indexed:,} | {skipped:,} | {duration} | {rss} | {db} |".format(
                role=dataset["role"],
                id=dataset["id"],
                compressed=mib(dataset["input"]["compressed_bytes"]),
                uncompressed=mib(dataset["input"]["uncompressed_bytes"]),
                features=source["feature_rows"],
                sequences=source["distinct_sequences"],
                indexed=counts["indexed_rows"],
                skipped=counts["skipped_rows"],
                duration=seconds(run["external_wall_seconds"]),
                rss=mib(run["peak_process_tree_rss_bytes"]),
                db=mib(run["indexer"]["output"]["size_bytes"]),
            )
        )

    lines.extend(["", "### Feature and annotation distributions", ""])
    for dataset in indexer.get("datasets", []):
        source = dataset["source_characteristics"]
        feature_types = ", ".join(
            f"`{name}`={count:,}"
            for name, count in sorted(
                source["feature_type_distribution"].items(),
                key=lambda item: (-item[1], item[0].lower()),
            )
        )
        annotation_fields = ", ".join(
            f"`{name}`={count:,}"
            for name, count in sorted(
                source["annotation_field_distribution"].items(),
                key=lambda item: (-item[1], item[0].lower()),
            )
        )
        lines.extend(
            [
                f"#### {dataset['role'].title()}: `{dataset['id']}`",
                "",
                f"Feature types: {feature_types or 'None'}.",
                "",
                f"Annotation fields: {annotation_fields or 'None'}.",
                "",
            ]
        )
    return lines


def render_browser(browser_results: list[dict[str, Any]]) -> list[str]:
    lines = [
        "## Browser baseline",
        "",
        "| Dataset | Metric | Median | p95 | Samples |",
        "|---|---|---:|---:|---:|",
    ]
    for result in browser_results:
        role = result["dataset_role"]
        initialisation = result.get("initialisation", [])
        for field, label in (
            ("worker_initialisation_ms", "Worker database initialisation"),
            ("page_ready_ms", "Page to searchable UI"),
            ("long_task_duration_ms", "Initialisation long-task duration"),
            ("js_heap_used_bytes", "Initialisation JS heap"),
        ):
            values = [
                sample[field]
                for sample in initialisation
                if sample.get(field) is not None
            ]
            if not values:
                continue
            median, p95 = summary(values)
            formatter = mib if field.endswith("bytes") else milliseconds
            lines.append(
                f"| {role} | {label} | {formatter(median)} | {formatter(p95)} | {len(values)} |"
            )

        groups: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
        searches = result.get("searches", [])
        for field, label in (
            ("long_task_duration_ms", "Search long-task duration"),
            ("js_heap_used_bytes", "Search JS heap"),
        ):
            values = [
                sample[field] for sample in searches if sample.get(field) is not None
            ]
            if not values:
                continue
            median, p95 = summary(values)
            formatter = mib if field.endswith("bytes") else milliseconds
            lines.append(
                f"| {role} | {label} | {formatter(median)} | {formatter(p95)} | {len(values)} |"
            )

        for sample in searches:
            groups[(sample["cache_state"], sample["category"], sample["query"])].append(
                sample
            )
        for (cache_state, category, query), samples in sorted(groups.items()):
            visible_median, visible_p95 = summary(
                sample["visible_results_ms"] for sample in samples
            )
            worker_median, worker_p95 = summary(
                sample["worker_query_ms"] for sample in samples
            )
            lines.append(
                f"| {role} | {cache_state} `{query}` ({category}), visible | "
                f"{milliseconds(visible_median)} | {milliseconds(visible_p95)} | {len(samples)} |"
            )
            lines.append(
                f"| {role} | {cache_state} `{query}` ({category}), worker | "
                f"{milliseconds(worker_median)} | {milliseconds(worker_p95)} | {len(samples)} |"
            )
    return lines


def render_environment(
    indexer: dict[str, Any], browser_results: list[dict[str, Any]]
) -> list[str]:
    environment = indexer.get("environment", {})
    lines = [
        "## Environment",
        "",
        f"- Platform: `{environment.get('platform', 'unknown')}`",
        f"- Processor: `{environment.get('processor') or 'unknown'}`",
        f"- CPU cores: {environment.get('physical_cpu_count', 'unknown')} physical / {environment.get('logical_cpu_count', 'unknown')} logical",
        f"- Memory: {mib(environment['total_memory_bytes']) if environment.get('total_memory_bytes') else 'unknown'}",
        f"- Python: `{environment.get('python_version', 'unknown')}`",
        f"- psutil: `{environment.get('psutil_version', 'unknown')}`",
    ]
    if browser_results:
        browser = browser_results[0].get("environment", {})
        lines.extend(
            [
                f"- Node.js: `{browser.get('node_version', 'unknown')}`",
                f"- npm: `{browser.get('npm_version', 'unknown')}`",
                f"- Playwright: `{browser.get('playwright_version', 'unknown')}`",
                f"- Browser: `{browser.get('browser_name', 'unknown')} {browser.get('browser_version', 'unknown')}`",
                f"- SQLite WASM: `{browser.get('sqlite_wasm_version', 'unknown')}`",
                f"- sqlite-wasm-http: `{browser.get('sqlite_wasm_http_version', 'unknown')}`",
                f"- Vite: `{browser.get('vite_version', 'unknown')}`",
            ]
        )
    datasets = indexer.get("datasets", [])
    if datasets:
        first_stats = datasets[0].get("index_run", {}).get("indexer", {})
        lines.extend(
            [
                f"- Native SQLite: `{first_stats.get('environment', {}).get('sqlite_version', 'unknown')}`",
                f"- Git commit: `{first_stats.get('environment', {}).get('git_commit', 'unknown')}`",
                f"- Benchmark date (UTC): `{indexer.get('created_at', 'unknown')}`",
            ]
        )
    lines.append("")
    return lines


def render_targets(browser_results: list[dict[str, Any]]) -> list[str]:
    baseline_searches = [
        sample
        for result in browser_results
        if result.get("run_type") == "baseline"
        for sample in result.get("searches", [])
    ]
    lines = ["## Proposed quantitative targets", ""]
    if not baseline_searches:
        lines.extend(
            [
                "No formal targets are proposed from smoke data. Run the documented baseline commands first.",
                "",
            ]
        )
        return lines

    visible_p95 = percentile(
        (sample["visible_results_ms"] for sample in baseline_searches), 0.95
    )
    proposed_search_budget = max(3000, math.ceil(visible_p95 * 1.2 / 100) * 100)
    lines.extend(
        [
            f"- Search responsiveness: visible-results p95 under **{proposed_search_budget:,} ms** for the canonical query matrix (20% headroom over this baseline, never below the existing 3,000 ms guard).",
            "- Indexer reliability: every canonical input must complete verification with zero database-integrity errors and record process-tree peak RSS.",
            "- Main-thread responsiveness: no search may introduce a task longer than 200 ms; investigate any p95 long-task total above 250 ms.",
            "- Regressions: database output size, indexing time, peak RSS, and browser p95 may not worsen by more than 20% without documented evidence and mentor approval.",
            "",
            "> These are proposals. Issue #14 remains open until mentors explicitly review and agree the targets.",
            "",
        ]
    )
    return lines


def is_issue14_canonical(indexer: dict[str, Any]) -> bool:
    datasets = indexer.get("datasets", [])
    return len(datasets) == 3 and {dataset.get("role") for dataset in datasets} == {
        "small",
        "medium",
        "large",
    }


def generate_report(
    indexer: dict[str, Any], browser_results: list[dict[str, Any]]
) -> str:
    run_types = {indexer.get("run_type", "unknown")}
    run_types.update(result.get("run_type", "unknown") for result in browser_results)
    formal = run_types == {"baseline"}
    issue14 = is_issue14_canonical(indexer)
    lines = [
        (
            "# Issue #14 reproducible performance baseline"
            if issue14
            else "# GFF-to-SQLite performance benchmark"
        ),
        "",
        f"Status: **{'formal baseline' if formal else 'partial/smoke evidence'}**.",
        "",
        "This report is generated from machine-readable indexer and Playwright results. "
        "The commands in `benchmark/README.md` are the reproducibility contract.",
        "",
    ]
    lines.extend(render_environment(indexer, browser_results))
    lines.extend(render_indexer(indexer))
    lines.extend(render_browser(browser_results))
    lines.extend(["", *render_targets(browser_results)])
    if issue14:
        lines.extend(
            [
                "## Acceptance status",
                "",
                "- [x] Profiling can be rerun using documented commands.",
                "- [x] Three representative input sizes were tested.",
                "- [x] The large compressed input is greater than 100 MB.",
                "- [x] Indexing time, peak memory and output size are recorded.",
                "- [x] Browser initialisation and representative search latency are recorded.",
                "- [ ] The baseline report and machine-readable results are generated and ready to commit in the Issue #14 pull request.",
                "- [ ] Proposed performance targets require mentor review on Issue #14 or its pull request.",
                "- [ ] Follow-up optimisation work must be linked to observed evidence if mentors request it.",
                "",
                "## Historical context",
                "",
                "The earlier manual Drosophila and NCBI GRCh38 reports remain supporting evidence. "
                "They showed that rowid keyset pagination materially reduced broad-query Range traffic, "
                "and that the paired `detail=none`/`columnsize=0` build reduced database size. They are "
                "not mixed into the formal statistics because their schema, repetitions and cache controls differ.",
                "",
            ]
        )
    else:
        lines.extend(
            [
                "## Benchmark scope",
                "",
                "This is a custom-dataset benchmark. It does not claim completion of the three-dataset Issue #14 acceptance criteria.",
                "",
            ]
        )
    lines.extend(
        [
            "## Limitations and follow-up",
            "",
            "- Browser results depend on hosting latency, Range support, browser version and cache state.",
            "- Chromium JS heap is reported where the DevTools protocol exposes it; it is not total browser RSS.",
            "- Long-task observation covers the page main thread, while SQLite runs in a worker.",
            "- Link optimization issues only when the formal p95 or resource evidence identifies a bottleneck.",
        ]
    )
    if issue14:
        lines.append(
            "- Mentor review of proposed targets must be linked from Issue #14 before closure."
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--indexer-results", type=Path, required=True)
    parser.add_argument("--browser-results", type=Path, action="append", default=[])
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = generate_report(
        load_json(args.indexer_results),
        [load_json(path) for path in args.browser_results],
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(report, encoding="utf-8", newline="\n")
    print(f"Wrote report to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
