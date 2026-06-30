import sqlite3

db_path = "database/genomics.db.zip"
print(f"Verifying {db_path}...")

c = sqlite3.connect(db_path)

# Verify table counts
meta_count = c.execute("SELECT count(*) FROM feature_meta").fetchone()[0]
fts_count = c.execute("SELECT max(rowid) FROM search_fts").fetchone()[0]
print(f"feature_meta count: {meta_count:,}")
print(f"search_fts max rowid: {fts_count:,}")

# Perform a test search query to verify FTS functionality and JOIN
query = "nfrA2*"
print(f"\n--- Searching for {query} ---")
rows = c.execute(
    """
    SELECT m.name, m.feature_type, m.biotype, m.functional_summary
    FROM (
        SELECT rowid, rank
        FROM search_fts
        WHERE search_fts MATCH ?
        ORDER BY rank
        LIMIT 5
    ) f
    JOIN feature_meta m ON m.rowid = f.rowid
    ORDER BY f.rank
    """,
    (query,),
).fetchall()

for row in rows:
    print(f"Name: {row[0]} | Type: {row[1]} | Biotype: {row[2]}\nSummary: {row[3]}\n")

# Another test search with a GO term
query2 = "go 0003677"
print(f"\n--- Searching for {query2} ---")
rows2 = c.execute(
    """
    SELECT m.name, m.feature_type, m.functional_summary
    FROM (
        SELECT rowid, rank
        FROM search_fts
        WHERE search_fts MATCH ?
        ORDER BY rank
        LIMIT 5
    ) f
    JOIN feature_meta m ON m.rowid = f.rowid
    ORDER BY f.rank
    """,
    (query2,),
).fetchall()

for row in rows2:
    print(f"Name: {row[0]} | Type: {row[1]}\nSummary: {row[2]}\n")

# Verify contentless FTS returns NULL for direct column requests
print("\n--- Contentless behavior check ---")
contentless_row = c.execute(
    "SELECT name, annotations FROM search_fts LIMIT 1"
).fetchone()
print(f"Direct SELECT from search_fts: {contentless_row}")

c.close()
print("Verification complete.")
