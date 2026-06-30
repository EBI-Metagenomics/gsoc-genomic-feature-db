# Why We Don't Use Pure FTS5

This document explains the design decisions behind our FTS5 configuration. We use a **tuned, compact** FTS5 setup instead of the default "pure" FTS5 because our database is served to web browsers over HTTP — every extra byte costs real network time.

---

## Our Setup vs. Pure FTS5

| Setting | Pure FTS5 (default) | Our choice | Why |
|---------|---------------------|------------|-----|
| `content` | Stores full text | `content=''` (contentless) | We have `feature_meta` for display data — no need to store it twice |
| `detail` | `full` (stores token positions) | `column` (stores rowid + column number) | We need column-targeted search (`name:BRCA1`) but not phrase search |
| `columnsize` | `1` (stores column lengths) | `1` (we keep this) | Helps BM25 rank shorter, more relevant results higher |

---

## What is Contentless FTS? (`content=''`)

Think of FTS5 as having two parts:

```
┌─────────────────────────────────────────────────────┐
│                    FTS5 Table                        │
│                                                     │
│  ┌──────────────────┐    ┌───────────────────────┐  │
│  │   %_content      │    │   Inverted Index      │  │
│  │   (text storage) │    │   (search engine)     │  │
│  │                  │    │                       │  │
│  │  Row 1: "dnaA..  │    │  "dnaA"  → row 1,5   │  │
│  │  Row 2: "rpoB..  │    │  "rpoB"  → row 2     │  │
│  │  Row 3: "kinase. │    │  "kinase"→ row 3,7   │  │
│  │  ...              │    │  ...                  │  │
│  └──────────────────┘    └───────────────────────┘  │
│        ↑                          ↑                  │
│   Used for display           Used for search         │
│   (SELECT columns)          (WHERE MATCH)            │
└─────────────────────────────────────────────────────┘
```

**Pure FTS5** keeps both parts. **Contentless FTS5** (`content=''`) throws away the left side:

```
┌─────────────────────────────────────────────────────┐
│              Contentless FTS5 Table                   │
│                                                     │
│  ┌──────────────────┐    ┌───────────────────────┐  │
│  │   %_content      │    │   Inverted Index      │  │
│  │                  │    │   (search engine)     │  │
│  │   DOES NOT       │    │                       │  │
│  │   EXIST          │    │  "dnaA"  → row 1,5   │  │
│  │                  │    │  "rpoB"  → row 2     │  │
│  │   (saved ~40%    │    │  "kinase"→ row 3,7   │  │
│  │    of DB size)   │    │  ...                  │  │
│  └──────────────────┘    └───────────────────────┘  │
│                                   ↑                  │
│                              Used for search         │
│                             (WHERE MATCH)            │
└─────────────────────────────────────────────────────┘
```

The search engine works exactly the same — it only uses the inverted index to find matching rows. It never looks at `%_content` during a search.

### But where does the display data come from?

That's what `feature_meta` is for:

```
User types "dnaA"
     │
     ▼
 search_fts (contentless)
 ┌────────────────────────────┐
 │ Inverted Index             │
 │ "dnaa" → rowid 42          │──── finds matching rowid
 └────────────────────────────┘
     │
     │  rowid = 42
     ▼
 feature_meta (regular table)
 ┌────────────────────────────────────────────────────┐
 │ rowid │ name │ seqid        │ start │ description  │
 │  42   │ dnaA │ NC_012345.1  │ 12345 │ replication..│──── returns display data
 └────────────────────────────────────────────────────┘
     │
     ▼
 UI shows: dnaA | NC_012345.1:12,345-15,678 | replication initiator...
```

Two tables, one job each. No data stored twice unnecessarily.

---

## What is `detail=column`?

In the inverted index, FTS5 can store different levels of detail about where a word appears:

| Level | What is stored per match | Example for "kinase" in row 42 | Size |
|-------|--------------------------|-------------------------------|------|
| `full` (default) | rowid + column + position in text | `row 42, column 4, word #3, byte 28` | **Large** |
| `column` (ours) | rowid + column number | `row 42, column 4` | **Medium** |
| `none` | rowid only | `row 42` | Smallest |

### What does `detail=full` enable?

**Phrase search** — finding exact word sequences:

```sql
-- "protein kinase" as an exact phrase
WHERE search_fts MATCH '"protein kinase"'
```

To know if "protein" and "kinase" appear **next to each other**, FTS5 needs their positions. With `detail=column`, it knows both words appear in the row and *which columns* they are in — but not whether they're adjacent within the same column.

### Why we chose `detail=column` over `detail=none`

We previously used `detail=none`, which was the absolute smallest index. However, it came with a significant usability limitation: there was no way to search a specific column. If a user searched for `"muscle"`, it would match any row where that word appeared in *any* column — even a 500-word background description. This caused false positives for users strictly looking for a gene *named* "muscle".

`detail=column` solves this by recording which column each token belongs to, unlocking targeted queries:

```
"dnaA"                 → single term, works fine                     ✅
"PF00069"              → single accession, works fine                ✅
"name:BRCA1"           → only search the name column                 ✅
"biotype:protein_coding" → only search biotype                       ✅
"name:dnaA biotype:mRNA" → combine column filters                    ✅
"protein kinase"       → becomes "protein* kinase*" (both must appear) ✅
```

Our search bar already splits multi-word queries into individual terms with `*` for prefix matching. We never send phrase queries to FTS5. So we don't need `detail=full` — storing exact positions would waste space for a feature we never use.

### Why not `detail=none`?

`detail=none` would be ~10–20% smaller, but it makes column-targeted search impossible. Since our UI provides an "Advanced Column Search" dropdown (e.g., search only in `name`, `biotype`, or `annotations`), we need `detail=column` for this feature to work.

### Size impact

For a 100K-feature database:

| Setting | Inverted index size |
|---------|-------------------|
| `detail=full` | ~4–8 MB |
| `detail=column` | ~1.2–2.4 MB |
| `detail=none` | ~1–2 MB |

`detail=column` adds roughly **10–20%** over `detail=none`, but enables column-targeted search — a significant UX improvement for a small size cost.

---

## What is `columnsize=1`?

This stores the byte-length of each column for every row. FTS5 uses this for **BM25 ranking** — deciding which results are most relevant.

### Simple example

Search: `"kinase"`

| Row | description | Length |
|-----|-------------|--------|
| A | `"protein kinase C"` | 18 bytes (short) |
| B | `"DNA-directed RNA polymerase with weak protein kinase activity among many other enzymatic functions"` | 100 bytes (long) |

Both rows contain "kinase", but Row A is **more about kinase** (1 out of 3 words) than Row B (1 out of 15 words).

- **With `columnsize=1`**: BM25 knows Row A is short → boosts it → **Row A ranks first** ✅
- **With `columnsize=0`**: BM25 assumes both rows are average length → might rank them equally or wrong

### Why we keep it

The size cost is small (~0.3–0.5 MB for our database), and the ranking improvement is meaningful when users search general terms like "kinase", "transporter", or "replication" that match many rows.

---

## What We Gain and What We Lose

### What `detail=column` gives us

| Capability | Example |
|------------|----------|
| **Column-targeted search** | `name:BRCA1` — only matches rows where "BRCA1" appears in the `name` column |
| **Biotype filtering** | `biotype:protein_coding` — narrows results to a specific biotype |
| **Combined column queries** | `name:dnaA biotype:mRNA` — AND across columns |
| **Prefix + column** | `name:dnA*` — prefix search within a single column |

### What we still lose (and why it's okay)

| Lost capability | Why it's okay for us |
|-----------------|---------------------|
| **Phrase search** (`"exact phrase"`) | Our search bar splits into individual terms anyway. Users find what they need with boolean AND. |
| **NEAR queries** (`NEAR(word1 word2, 5)`) | Not used in our UI. |
| **`snippet()` / `highlight()`** | These need both `content` AND `detail=full`. We have neither. But we display `functional_summary` from `feature_meta` instead — cleaner for our use case. |
| **`SELECT` text from FTS table** | We SELECT from `feature_meta` via JOIN. FTS only finds the rowids. |
| **DELETE/UPDATE on FTS** | Our pipeline rebuilds the database from scratch each time. We never modify individual rows. |

---

## Where Each Piece of Data Lives

```
                        feature_meta              search_fts
                        (regular table)           (contentless FTS5)
                        ───────────────           ─────────────────
                        Stores: real data         Stores: search tokens only
                        Purpose: show in UI       Purpose: find matching rows

feature_id              ✅ "gene-BU_03408"        ✅ tokens: [gene, bu, 03408]
name                    ✅ "dnaA"                  ✅ tokens: [dnaa]
feature_type            ✅ "gene"                  ❌ not searchable
seqid                   ✅ "NC_012345.1"           ❌ not searchable
start                   ✅ 12345                   ❌ not searchable
end                     ✅ 15678                   ❌ not searchable
strand                  ✅ "+"                     ❌ not searchable
biotype                 ✅ "protein_coding"        ✅ tokens: [protein, coding]
description             ✅ "chromosomal rep..."    ✅ tokens: [chromosomal, replication, ...]
functional_summary      ✅ "pfam: PF00308 | ..."   ❌ not searchable
annotations             ❌ not stored              ✅ tokens: [pfam, pf00308, go, 0003677, ...]
```

Notice `annotations` — the longest field with all the Pfam, GO, KEGG, InterPro terms — is **searchable but never stored as text**. Only the shorter `functional_summary` is stored for display. This is the biggest space saving.

---

## Size Comparison

| Configuration | Estimated size | Notes |
|---|---|---|
| Pure FTS5 (all defaults, single table) | ~18–20 MB | Everything stored and indexed with full detail |
| Current design (single FTS5 + UNINDEXED cols) | ~5.4 MB | Compact but still stores content |
| **Our new design** (contentless FTS + feature_meta) | **~3.0–3.8 MB** | Smallest possible while keeping full search |

Our design is roughly **5–6x smaller** than pure FTS5 with zero loss in search accuracy.

---

## Summary

We chose `content=''` + `detail=column` + `columnsize=1` because:

1. **Our database is downloaded by browsers** — every MB matters
2. **We have `feature_meta` for display** — no need to store text twice in FTS
3. **We need column-targeted search** — users can filter by `name:`, `biotype:`, `annotations:` etc.
4. **We don't use phrase search** — our search bar uses individual terms with prefix matching, so `detail=full` is unnecessary
5. **We do want good ranking** — `columnsize=1` costs little but improves result ordering
6. **Our pipeline is write-once** — we rebuild from GFF files, so DELETE/UPDATE are irrelevant
