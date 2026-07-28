import argparse
import sqlite3


def verify_database(db_path: str) -> None:
    """Print integrity and representative search details for one database."""
    print(f"Verifying {db_path}...")

    c = sqlite3.connect(db_path)

    meta_count = c.execute("SELECT count(*) FROM feature_meta").fetchone()[0]
    fts_count = c.execute("SELECT max(rowid) FROM search_fts").fetchone()[0]
    print(f"feature_meta count: {meta_count:,}")
    print(f"search_fts max rowid: {fts_count:,}")

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
        print(
            f"Name: {row[0]} | Type: {row[1]} | Biotype: {row[2]}\n"
            f"Summary: {row[3]}\n"
        )

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

    print("\n--- Contentless behavior check ---")
    contentless_row = c.execute(
        "SELECT name, annotations FROM search_fts LIMIT 1"
    ).fetchone()
    print(f"Direct SELECT from search_fts: {contentless_row}")

    c.close()
    print("Verification complete.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inspect a generated feature database."
    )
    parser.add_argument("database", help="Path to a raw SQLite .db.zip file")
    args = parser.parse_args()
    verify_database(args.database)


if __name__ == "__main__":
    main()
