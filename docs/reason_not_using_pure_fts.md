# Why We Use Contentless FTS5 Instead of Pure FTS5

The application searches a static SQLite database in the browser. Database pages
arrive through HTTP Range requests, so storing unnecessary bytes directly affects
initialisation and broad-search transfer.

## The two-table design

`feature_meta` is a normal SQLite table. It stores the readable and typed fields
used by the interface and JBrowse: identifier, name, feature type, sequence ID,
coordinates, strand, description, and compact functional summary.

`search_fts` is a contentless FTS5 table. It stores an inverted index over the
searchable text fields: identifier, name, biotype, description, and annotations.
It does not store retrievable copies of that text.

During indexing, one explicit rowid is assigned to each feature and inserted into
both tables. At search time, FTS5 finds matching rowids and SQLite joins them to
`feature_meta` to return the fields displayed to the user.

```text
user query -> safe all-field FTS5 MATCH -> matching rowids
           -> JOIN feature_meta on rowid -> display and JBrowse data
```

This avoids duplicating display data while preserving fast text search.

## Current FTS5 settings

| Setting | Current value | Reason |
| --- | --- | --- |
| `content` | `''` | Searchable text is not stored twice; display data comes from `feature_meta`. |
| `detail` | `none` | The UI uses all-field prefix matching and does not need column or token-position metadata. |
| `columnsize` | `0` | Results use stable rowid order rather than BM25, so document-length statistics are unused. |
| `tokenize` | `unicode61 tokenchars '_.'` | Keeps genomic identifiers containing underscores and periods searchable as one token. |

The selected `detail=none, columnsize=0` configuration is not intended for
column-scoped, phrase, proximity, snippet, or highlight queries. Those features
are not part of the current product contract. Search-result display comes from
`feature_meta`, not from FTS5 snippets.

## Why this is preferable for the current UI

The current component needs predictable, paginated navigation through matching
features. It uses stable rowid order, fetches 25 results plus one look-ahead row,
and requests database pages on demand. BM25 ranking would require extra scoring
and sorting work for broad matches, while its document-length metadata is not
used by the current query.

Benchmarking against the former `detail=column, columnsize=1` configuration
showed that `none/0` reduced total database size by about 17 percent and
aggregate p95 search transfer by 63.7 percent, with similar visible-search
latency. The complete methodology and exact dataset results are recorded in
[`benchmark/final-report-all-three-setups.md`](../benchmark/final-report-all-three-setups.md).

## Future choices

If researchers need field-specific search or relevance ranking, those should be
introduced as explicit product requirements. The database would need rebuilding
with a compatible FTS setting and the new behaviour should be measured against
database size, HTTP Range transfer, visible latency, and user usefulness.
