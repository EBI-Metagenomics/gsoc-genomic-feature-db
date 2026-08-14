# Documentation

This directory contains the maintained user, contributor, architecture, data,
package, and decision documentation for the project.

## Start here

| Document                                                      | Audience and purpose                                                                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [User guide](USAGE.md)                                        | Run the repository demo, build the local package, and execute browser tests.                                                           |
| [Contributor guide](QuickStartGuide/Contributor%20Guide.md)   | Set up a checkout, validate changes, and prepare a pull request.                                                                       |
| [Architecture](architecture.md)                               | Understand the indexer, browser worker, reusable component, JBrowse boundary, public types, and runtime sequence through UML diagrams. |
| [Package integration](package-integration.md)                 | Review the private tarball package, its public API, and clean consumer workflow.                                                       |
| [Production data integration](production-data-integration.md) | Publish compatible SQLite, FASTA, GFF, and index assets with HTTP Range and CORS support.                                              |
| [JBrowse integration](jbrowse-integration.md)                 | Understand assembly/track configuration, navigation, coordinate conversion, and highlighting.                                          |

The frontend directory has its own [main README](../ui-component/README.md), and
the independent tarball fixture has a
[consumer README](../examples/package-consumer/README.md).

## Data and search contracts

| Document                                            | Purpose                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [Schema reference](schema-reference.md)             | SQLite schema version, tables, metadata, and compatibility policy.                       |
| [Search quality](search-quality.md)                 | Search semantics, fixed quality cases, pagination, performance targets, and limitations. |
| [Advanced column search](advanced_column_search.md) | Rationale and internal behavior for FTS5 column-scoped search.                           |
| [Why not pure FTS](reason_not_using_pure_fts.md)    | Storage rationale for the two-table contentless FTS design.                              |

The Python indexer has a focused [scripts README](../scripts/README.md). Browser
performance methodology, datasets, and historical measurements live in the
[benchmark README](../benchmark/README.md); benchmark outputs are evidence, not
general setup instructions.

## Decisions

- [ADR 0010: Range-aware SQLite loading](decisions/0010-range-aware-sqlite-loading.md)
- [ADR 0011: Publishable component with an internal JBrowse boundary](decisions/0011-publishable-component-jbrowse-boundary.md)

ADRs record decisions at the time they were accepted. Update them only by adding
status or superseding decisions; do not rewrite their historical rationale to match
later implementation details.

## Plans and historical material

The following documents record project proposals, timelines, implementation plans,
or follow-up work. They are useful context but are not the authoritative runbook for
the current implementation:

- `plan.md`
- `proposal.md`
- `issue-12-implementation-plan.md`
- `package-implementation-plan.md`
- `security-hardening-follow-up.md`

When a plan and an operational guide differ, use the current code, package manifest,
user guide, contributor guide, and accepted ADRs as the source of truth.
