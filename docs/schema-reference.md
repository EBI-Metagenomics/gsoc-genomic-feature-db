# Schema Reference

This document defines schema version 1 of the generated genomic feature database. The search architecture uses two feature tables: a regular table for display data and a contentless FTS5 virtual table. A third, single-row table records the schema and generator versions used by every compatible database.

For a detailed explanation of why we chose this configuration over pure FTS5, see [reason_not_using_pure_fts.md](reason_not_using_pure_fts.md).

## Data Ingestion Model (Dataclass)

During the indexing phase, raw GFF lines are parsed and validated by the parser's built-in checks (column count, integer casts, low-value filtering). Valid fields are stored in a typed `GenomicFeature` dataclass defined in `scripts/models.py`, which provides structured field documentation and tuple conversion for database insertion. After the database is fully built, a post-build verification step queries the actual stored data to confirm integrity.

* `feature_id` (string): The source feature identifier. It is not required to be unique; distinct features with the same source identifier retain distinct SQLite `rowid` values. If a feature lacks an explicit ID but remains indexable, one is automatically generated.
* `name` (string): The human-readable name of the feature, such as a gene symbol or locus tag.
* `feature_type` (string): The biological type of the feature (for example, gene, mRNA, or CDS).
* `seqid` (string): The sequence identifier, which typically represents the chromosome or contig where the feature is located.
* `start` (integer): The 1-based starting coordinate of the feature on the sequence.
* `end` (integer): The 1-based ending coordinate of the feature.
* `strand` (string): Indicates the strand the feature is located on: '+', '-', '.', or '?' when the source strand is unknown.
* `biotype` (string): A more specific classification of the feature, such as protein_coding or lncRNA.
* `description` (string): A general text description or product name associated with the feature.
* `annotations` (string, optional): A consolidated string containing configured functional tags (such as GO terms, Pfam domains, or aliases) extracted from the raw GFF attributes. It keeps up to 50 values and 2,000 characters per tag, excludes values already represented in identity/display fields, and is indexed for search but **not stored** in the display table.
* `functional_summary` (string, optional): A UI-oriented, source-grouped representation of the configured functional tags. It keeps up to 50 values and 2,000 characters per tag, with no global cap across tags, so the UI can render source badges and show their values in popovers.

### GFF3 attribute handling

Attribute keys are normalized to lowercase. Comma-separated and repeated values are accumulated in source order. Missing optional fields become empty strings or `NULL` display values as appropriate. An indexable feature without an explicit identifier receives a deterministic `generated_N` identifier for that build. Structurally short records and records with non-integer coordinates are skipped; invalid stored coordinates or strands fail post-build verification. Parent-child relationships remain in the source GFF/JBrowse track and are intentionally not copied into this compact search database.

`seqid` is preserved exactly. GFF3, SQLite records, and search results use one-based inclusive coordinates. JBrowse location text uses the same convention, while a JBrowse highlight converts the start to zero-based and keeps the end exclusive.

## SQLite Database Schema

The parsed data is inserted into two complementary feature tables optimized for browser-hosted querying via HTTP range requests. A small metadata table supplies the cross-component version contract. After insertion, a post-build verification step validates the actual database content (see [Post-Build Verification](#post-build-database-verification) below).

### Table 1: `feature_meta` (Display Metadata)

A regular SQLite table that stores all display-relevant data for the UI. Uses native SQLite types for compact storage.

```sql
CREATE TABLE IF NOT EXISTS feature_meta (
    rowid INTEGER PRIMARY KEY,
    feature_id TEXT,
    name TEXT,
    feature_type TEXT,
    seqid TEXT,
    start INTEGER,
    end INTEGER,
    strand TEXT,
    biotype TEXT,
    description TEXT,
    functional_summary TEXT
);
```

All columns are stored for display. This table is **not** searched directly — it is joined to the FTS results by rowid.

### Table 2: `database_metadata` (Version Contract)

```sql
CREATE TABLE IF NOT EXISTS database_metadata (
    schema_version INTEGER NOT NULL,
    generator_version TEXT NOT NULL
);
```

Every generated database contains exactly one row. `schema_version` changes when a reader-facing table, field, or semantic change would make an existing browser query incompatible. `generator_version` identifies the indexer behavior that produced the artifact and can change without requiring a new reader contract.

### Table 3: `search_fts` (Full-Text Search Index)

A contentless FTS5 virtual table that provides the inverted index for search. The `content=''` option means the original text is not stored — only search tokens are indexed.

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
    feature_id,
    name,
    biotype,
    description,
    annotations,
    content='',
    tokenize='unicode61 tokenchars ''_.''',
    detail=column,
    columnsize=1
);
```

#### Indexed Columns

These columns are fully indexed for text search. Any word present in these fields can be instantly found by the user.

* `feature_id`: Searched when users look up specific identifiers.
* `name`: The primary target for gene or feature name searches.
* `biotype`: Included in the index to allow filtering by specific biological classifications.
* `description`: Indexed to allow users to search for keywords within the product description.
* `annotations`: Indexed so that users can search for functional terms, database cross-references, or alternative aliases. It is limited to 50 values and 2,000 characters per tag to bound pathological rows.

#### Rowid Synchronization

Both tables share the same rowid space. When features are inserted, the same explicit rowid is used for both `INSERT INTO feature_meta` and `INSERT INTO search_fts`. This ensures the JOIN query works correctly:

```sql
SELECT
    m.rowid AS id,
    m.feature_id,
    m.name,
    m.feature_type,
    m.seqid,
    m.start,
    m.end,
    m.strand,
    m.biotype,
    m.description,
    m.functional_summary
FROM search_fts f
JOIN feature_meta m ON m.rowid = f.rowid
WHERE search_fts MATCH ?
ORDER BY f.rowid
LIMIT 26;
```

### FTS5 Configuration

The FTS5 table is configured with specific options to minimize file size, which is critical since the database is fetched by the browser via HTTP range requests.

* `content=''`: Makes the FTS table **contentless** — the inverted index stores only search tokens, not the original text. Display data comes from `feature_meta` via JOIN. This eliminates the `%_content` shadow table, saving ~40-50% of database size.
* `tokenize='unicode61 tokenchars ''_.'''`: Ensures that text is tokenized correctly while ignoring case and basic punctuation. The `tokenchars` option treats underscores and periods as part of the token (not separators), so identifiers like `BU_ATCC8492` and `NC_012345.1` remain intact as single searchable tokens.
* `detail=column`: Stores which column each token belongs to, enabling column-targeted queries (e.g., `name:BRCA1`, `biotype:protein_coding`). Phrase search is still not supported (that requires `detail=full`), but we don't need it since our search bar splits multi-word queries into individual prefix terms.
* `columnsize=1`: Stores per-column byte lengths. The current production query does not use BM25; this setting is retained for schema compatibility until `detail=column, columnsize=0` is benchmarked independently.
* `prefix='3 4'` (optional, enabled via `--prefix`): Pre-indexes 3 and 4-character prefixes for faster partial matching at the cost of larger file size.

Production fetches one row beyond the 25-row display page. That lookahead row is
not returned; it only determines whether another keyset page exists. See
[`search-quality.md`](search-quality.md) for the query semantics and fixed tests.

### Non-FTS index decision

Schema version 1 requires no secondary non-FTS indexes. FTS5 serves text lookup, while the `feature_meta.rowid` primary key serves the result join and keyset pagination. Sequence and region navigation use the separately deployed FASTA/GFF indexes through JBrowse. Feature-type facets summarize loaded results rather than issuing a database-side filter query. Additional indexes on `seqid`, coordinates, or `feature_type` would increase every downloaded database without serving a current production query, so they must be justified by a new measured query requirement before being added.

### Why Two Tables?

| Concern | `feature_meta` handles it | `search_fts` handles it |
|---------|---------------------------|------------------------|
| Display data for UI | ✅ All columns stored | ❌ Contentless, returns NULL |
| Full-text search | ❌ No search capability | ✅ Inverted index |
| `annotations` (full) | ❌ Not stored (too long for display) | ✅ Fully indexed for search |
| `functional_summary` (compact) | ✅ Stored for UI badges | ❌ Not indexed |
| Native integer types | ✅ `start`/`end` as INTEGER | N/A |
| `DELETE/UPDATE support` | ✅ Supported | ❌ Contentless FTS is immutable |

## Post-Build Database Verification

After the database is fully built and optimized, the indexer runs a verification pass that queries the actual stored data. This catches issues that per-row validation cannot (e.g., insertion bugs, encoding problems, rowid desync).

| # | Check | SQL | Catches |
|---|-------|-----|---------|
| 1 | Row count match | `SELECT count(*) FROM feature_meta` vs indexer counter | Silent row drops during insertion |
| 2 | Table count sync | `feature_meta` count vs `search_fts` count | Mismatched inserts between tables |
| 3 | Rowid sync | `max(rowid)` across both tables | Rowid desync breaking JOIN queries |
| 4 | No NULL feature IDs | `WHERE feature_id IS NULL OR feature_id = ''` | Missing identifiers |
| 5 | Valid coordinates | `WHERE start < 1 OR end < start` | Corrupt genomic positions |
| 6 | Valid strand | `WHERE strand NOT IN ('+', '-', '.', '?')` | Invalid strand values |
| 7 | Version metadata | Exact single `database_metadata` row | Missing or incompatible generator output |
| 8 | FTS5 integrity | `INSERT INTO search_fts(search_fts) VALUES ('integrity-check')` | FTS5 index corruption |

If any check fails, the indexer raises a `RuntimeError` with a descriptive message. On success, it prints:

```
[indexer] Verification passed: 8 checks OK (4,744,062 rows)
```

## Browser compatibility and migration policy

The browser reads `database_metadata` immediately after opening the SQLite file and before querying either feature table. It accepts only an explicitly supported schema version. Missing, malformed, or unsupported metadata produces a user-visible initialization error instead of allowing later SQL failures.

Generated databases are immutable, rebuildable artifacts. The project does not perform in-place SQLite migrations: when the schema changes, databases are regenerated from the source GFF and published with the compatible browser application. The SQLite database, GFF, FASTA, and their indexes should be published as one versioned, atomic dataset bundle so incompatible generations are never mixed.
