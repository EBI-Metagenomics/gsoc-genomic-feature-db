import sqlite3
import os


def make_schema(use_prefix: bool = False) -> str:
    prefix_sql = ",\n    prefix='3 4'" if use_prefix else ""

    return f"""
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

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
    feature_id,
    name,
    biotype,
    description,
    annotations,
    content='',
    tokenize='unicode61 tokenchars ''_.''',
    detail=column,
    columnsize=1{prefix_sql}
);
"""


INSERT_META = """
INSERT INTO feature_meta (
    rowid, feature_id, name, feature_type, seqid, start, end,
    strand, biotype, description, functional_summary
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
"""

INSERT_FTS = """
INSERT INTO search_fts (rowid, feature_id, name, biotype, description, annotations)
VALUES (?, ?, ?, ?, ?, ?);
"""


class DatabaseManager:
    def __init__(self, db_path: str, page_size: int = 4096, use_prefix: bool = False):
        self.db_path = db_path
        self.page_size = page_size
        self.use_prefix = use_prefix
        self.conn = self._prepare_database()
        self.cur = self.conn.cursor()
        self.cur.execute("BEGIN;")

    def _prepare_database(self) -> sqlite3.Connection:
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)

        if os.path.exists(self.db_path):
            os.remove(self.db_path)

        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()

        # Fast bulk-build settings
        cur.execute("PRAGMA journal_mode = OFF;")
        cur.execute("PRAGMA synchronous = OFF;")
        cur.execute("PRAGMA temp_store = MEMORY;")
        cur.execute("PRAGMA locking_mode = EXCLUSIVE;")
        cur.execute("PRAGMA secure_delete = OFF;")
        cur.execute(f"PRAGMA page_size = {int(self.page_size)};")
        cur.execute("PRAGMA cache_size = -300000;")

        cur.executescript(make_schema(self.use_prefix))
        conn.commit()

        return conn

    def insert_batch(self, meta_batch: list[tuple], fts_batch: list[tuple]) -> None:
        if meta_batch:
            self.cur.executemany(INSERT_META, meta_batch)
        if fts_batch:
            self.cur.executemany(INSERT_FTS, fts_batch)

    def commit_and_optimize(self, vacuum: bool = True) -> None:
        self.conn.commit()

        print("[indexer] Optimizing FTS...")
        self.cur.execute("INSERT INTO search_fts(search_fts) VALUES ('optimize');")
        self.conn.commit()

        print("[indexer] Running ANALYZE...")
        self.cur.execute("ANALYZE;")
        self.conn.commit()

        if vacuum:
            print("[indexer] Vacuuming database...")
            self.cur.execute("VACUUM;")
            self.conn.commit()

    def verify_database(self, expected_rows: int) -> None:
        """Post-build verification: query actual DB to assert data integrity."""
        print("[indexer] Verifying database integrity...")
        errors = []

        # 1. Row count matches what the indexer tracked
        meta_count = self.cur.execute("SELECT count(*) FROM feature_meta").fetchone()[0]
        if meta_count != expected_rows:
            errors.append(
                f"Row count mismatch: feature_meta has {meta_count}, "
                f"expected {expected_rows}"
            )

        # 2. feature_meta and search_fts have the same row counts
        fts_count = self.cur.execute("SELECT count(*) FROM search_fts").fetchone()[0]
        if meta_count != fts_count:
            errors.append(
                f"Table count mismatch: feature_meta={meta_count}, "
                f"search_fts={fts_count}"
            )

        # 3. Max rowid is synced between tables
        meta_max = self.cur.execute("SELECT max(rowid) FROM feature_meta").fetchone()[0]
        fts_max = self.cur.execute("SELECT max(rowid) FROM search_fts").fetchone()[0]
        if meta_max != fts_max:
            errors.append(
                f"Rowid desync: feature_meta max={meta_max}, "
                f"search_fts max={fts_max}"
            )

        # 4. No missing feature IDs
        null_ids = self.cur.execute(
            "SELECT count(*) FROM feature_meta "
            "WHERE feature_id IS NULL OR feature_id = ''"
        ).fetchone()[0]
        if null_ids > 0:
            errors.append(f"Found {null_ids} rows with NULL/empty feature_id")

        # 5. No invalid coordinates
        bad_coords = self.cur.execute(
            "SELECT count(*) FROM feature_meta WHERE start < 1 OR end < start"
        ).fetchone()[0]
        if bad_coords > 0:
            errors.append(f"Found {bad_coords} rows with invalid coordinates")

        # 6. No invalid strand values
        bad_strands = self.cur.execute(
            "SELECT count(*) FROM feature_meta " "WHERE strand NOT IN ('+', '-', '.')"
        ).fetchone()[0]
        if bad_strands > 0:
            errors.append(f"Found {bad_strands} rows with invalid strand values")

        # 7. FTS5 internal integrity check
        try:
            self.cur.execute(
                "INSERT INTO search_fts(search_fts) VALUES ('integrity-check')"
            )
        except Exception as exc:
            errors.append(f"FTS5 integrity check failed: {exc}")

        if errors:
            error_msg = "Database verification FAILED:\n" + "\n".join(
                f"  - {e}" for e in errors
            )
            raise RuntimeError(error_msg)

        print(f"[indexer] Verification passed: 7 checks OK ({meta_count:,} rows)")

    def rollback(self) -> None:
        self.conn.rollback()

    def close(self) -> None:
        self.conn.close()
