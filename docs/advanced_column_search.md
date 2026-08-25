# Advanced Column Search in SQLite FTS5

## Overview
This document explains the transition from the highly compressed `detail='none'` indexing strategy to the slightly more expressive `detail='column'` strategy in the genomic feature database's FTS (Full Text Search) index.

## The Problem with `detail='none'`
Previously, the `search_fts` virtual table was configured with `detail='none'`. 
- **What it does:** It creates a global text blast index. 
- **The Issue:** If a user searched for the word `"muscle"`, SQLite looked across *every single column* (Feature ID, Name, Description, Biotype, Annotations). There was no way to tell the system to "only search the Name column". If `"muscle"` appeared in a 500-word background description, it would cause a false positive for a user strictly looking for a gene named "muscle".

## The Solution: `detail='column'`
By updating the FTS5 schema to `detail='column'`, the index starts remembering *which column* each word belongs to.

### Capabilities Unlocked
- **Internal precision:** The query builder and quality tests can restrict a MATCH expression to one allow-listed column, e.g., `name : ("BRCA1"*)`.
- **Schema flexibility:** A future UI could add field filtering without rebuilding a `detail=column` database.
- **Space Efficiency:** Unlike `detail='full'`, `detail='column'` stores column
  identity without exact token positions. It is materially smaller than full
  positional detail; any further reduction to `detail='none'` should be measured
  independently before rebuilding databases.

Production currently searches every indexed field together and does not expose a
field dropdown or accept FTS column syntax from users. Column scoping is an
internal, allow-listed capability rather than a documented user query language.

## Clarification: `annotations` vs. `functional_summary`
The `feature_meta` table contains a `functional_summary` column, while the `search_fts` table contains an `annotations` column. Both derive from the exact same underlying source (`FUNCTIONAL_TAGS` in the GFF file, such as GO terms, EC numbers, and cross-references).

Why don't we add `functional_summary` to the FTS table?
1. **`functional_summary` is built for UI display.** It preserves the configured functional tags and their source grouping so the UI can render one compact badge per source and show that source's values in a popover. It keeps up to 50 values and 2,000 characters per tag, with no global cap across tags.
2. **`annotations` is built for search.** It uses the same per-tag limits, but removes values already present in `feature_id`, `name`, `biotype`, or `description` to avoid duplicate index terms. It is inserted into contentless FTS5, so its original text is not retrievable for display.

**Conclusion:** The fields have complementary jobs. `annotations` supplies the full search index; `functional_summary` supplies the grouped annotation values needed for the UI badges and popovers. Functional identifiers such as GO or EC values are found by the production all-field search; adding `functional_summary` to the FTS table would be redundant.
