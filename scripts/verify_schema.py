import argparse
import sqlite3


def verify_database(db_path: str) -> None:
    """Print integrity and representative search details for one database."""
    print(f"Verifying {db_path}...")

    c = sqlite3.connect(db_path)

    meta_count = c.execute("SELECT count(*) FROM feature_meta").fetchone()[0]
    schema_version, generator_version = c.execute(
        "SELECT schema_version, generator_version FROM database_metadata"
    ).fetchone()
    print(f"feature_meta count: {meta_count:,}")
    print("search_fts: contentless detail=none index (non-MATCH scans disabled)")
    print(f"schema version: {schema_version}")
    print(f"generator version: {generator_version}")

    query = "nfrA2*"
    print(f"\n--- Searching for {query} ---")
    rows = c.execute(
        """
        SELECT m.name, m.feature_type, m.biotype, m.functional_summary
        FROM (
            SELECT rowid
            FROM search_fts
            WHERE search_fts MATCH ?
            ORDER BY rowid
            LIMIT 5
        ) f
        JOIN feature_meta m ON m.rowid = f.rowid
        ORDER BY f.rowid
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
            SELECT rowid
            FROM search_fts
            WHERE search_fts MATCH ?
            ORDER BY rowid
            LIMIT 5
        ) f
        JOIN feature_meta m ON m.rowid = f.rowid
        ORDER BY f.rowid
        """,
        (query2,),
    ).fetchall()

    for row in rows2:
        print(f"Name: {row[0]} | Type: {row[1]}\nSummary: {row[2]}\n")

    print("\n--- Contentless behavior check ---")
    contentless_row = c.execute(
        "SELECT name, annotations FROM search_fts WHERE search_fts MATCH ? LIMIT 1",
        (query,),
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
