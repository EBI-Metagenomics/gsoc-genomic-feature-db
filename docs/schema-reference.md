# Schema Reference

This document outlines the data structures used by the genomic feature database. Our architecture uses a **two-table design**: a regular table for display metadata and a contentless FTS5 virtual table for full-text search.

For a detailed explanation of why we chose this configuration over pure FTS5, see [reason_not_using_pure_fts.md](reason_not_using_pure_fts.md).

## Data Ingestion Model (Dataclass)

During the indexing phase, raw GFF lines are parsed and validated by the parser's built-in checks (column count, integer casts, low-value filtering). Valid fields are stored in a typed `GenomicFeature` dataclass defined in `scripts/models.py`, which provides structured field documentation and tuple conversion for database insertion. After the database is fully built, a post-build verification step queries the actual stored data to confirm integrity.

* `feature_id` (string): The unique identifier for the feature. If a feature lacks an explicit ID in the source file, one is automatically generated.
* `name` (string): The human-readable name of the feature, such as a gene symbol or locus tag.
* `feature_type` (string): The biological type of the feature (for example, gene, mRNA, or CDS).
* `seqid` (string): The sequence identifier, which typically represents the chromosome or contig where the feature is located.
* `start` (integer): The 1-based starting coordinate of the feature on the sequence.
* `end` (integer): The 1-based ending coordinate of the feature.
* `strand` (string): Indicates the strand the feature is located on. It is usually '+', '-', or '.' for unstranded features.
* `biotype` (string): A more specific classification of the feature, such as protein_coding or lncRNA.
* `description` (string): A general text description or product name associated with the feature.
* `annotations` (string, optional): A consolidated string containing high-value functional tags (like GO terms, Pfam domains, or aliases) extracted from the raw GFF attributes. This is indexed for search but **not stored** in the display table.
* `functional_summary` (string, optional): A compact version of annotations (max 300 characters, max 3 values per tag) intended for display in the UI results table.

## SQLite Database Schema

The parsed data is inserted into two complementary tables optimized for browser-hosted querying via HTTP range requests. After insertion, a post-build verification step validates the actual database content (see [Post-Build Verification](#post-build-database-verification) below).

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

### Table 2: `search_fts` (Full-Text Search Index)

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
* `annotations`: Indexed so that users can search for functional terms, database cross-references, or alternative aliases. This is the **full** annotation text, not truncated.

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
ORDER BY rank
LIMIT 25;
```

### FTS5 Configuration

The FTS5 table is configured with specific options to minimize file size, which is critical since the database is fetched by the browser via HTTP range requests.

* `content=''`: Makes the FTS table **contentless** — the inverted index stores only search tokens, not the original text. Display data comes from `feature_meta` via JOIN. This eliminates the `%_content` shadow table, saving ~40-50% of database size.
* `tokenize='unicode61 tokenchars ''_.'''`: Ensures that text is tokenized correctly while ignoring case and basic punctuation. The `tokenchars` option treats underscores and periods as part of the token (not separators), so identifiers like `BU_ATCC8492` and `NC_012345.1` remain intact as single searchable tokens.
* `detail=column`: Stores which column each token belongs to, enabling column-targeted queries (e.g., `name:BRCA1`, `biotype:protein_coding`). Phrase search is still not supported (that requires `detail=full`), but we don't need it since our search bar splits multi-word queries into individual prefix terms.
* `columnsize=1`: Stores per-column byte lengths for BM25 ranking accuracy. This allows FTS5 to rank shorter, more relevant documents higher than long documents that incidentally contain the search term.
* `prefix='3 4'` (optional, enabled via `--prefix`): Pre-indexes 3 and 4-character prefixes for faster partial matching at the cost of larger file size.

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
| 6 | Valid strand | `WHERE strand NOT IN ('+', '-', '.')` | Invalid strand values |
| 7 | FTS5 integrity | `INSERT INTO search_fts(search_fts) VALUES ('integrity-check')` | FTS5 index corruption |

If any check fails, the indexer raises a `RuntimeError` with a descriptive message. On success, it prints:

```
[indexer] Verification passed: 7 checks OK (4,744,062 rows)
```