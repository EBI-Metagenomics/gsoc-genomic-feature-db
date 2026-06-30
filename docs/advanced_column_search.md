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
- **Laser Precision:** Users can explicitly search a specific column, e.g., `name:BRCA1`. This strictly finds genes named BRCA1 and ignores mentions in descriptions.
- **Biotype Filtering:** Users can search `biotype:gene` to only return genes.
- **Combined Queries:** Power users can combine filters, e.g., `name:dnaA biotype:mRNA`.
- **Space Efficiency:** Unlike `detail='full'` (which stores exact word positions and massively bloats the `.db` file size), `detail='column'` only stores the column index. This provides advanced search capabilities with almost **zero increase in database size**.

## Clarification: `annotations` vs. `functional_summary`
The `feature_meta` table contains a `functional_summary` column, while the `search_fts` table contains an `annotations` column. Both derive from the exact same underlying source (`FUNCTIONAL_TAGS` in the GFF file, such as GO terms, EC numbers, and cross-references).

Why don't we add `functional_summary` to the FTS table?
1. **`functional_summary` is built for UI Display.** It strictly limits data to a maximum of 3 items per tag and truncates the string to 300 characters to ensure it looks clean on the screen.
2. **`annotations` is built for Search Engines.** It holds up to 6 items per tag, avoids aggressive truncation, and systematically strips out duplicate words that already exist in the `name` or `description` to prevent index bloat.

**Conclusion:** The `annotations` column is significantly better suited for searching. If users want to find specific functional annotations (like a specific GO term or EC number), they should simply use the `annotations:` filter. Adding `functional_summary` to the FTS table would be redundant and less effective.
