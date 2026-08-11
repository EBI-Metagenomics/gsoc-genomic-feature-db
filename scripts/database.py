import os
import sqlite3

from config import (
    GENERATOR_VERSION,
    PAGE_SIZE,
    PRAGMA_CACHE_SIZE,
    PRAGMA_JOURNAL_MODE,
    PRAGMA_LOCKING_MODE,
    PRAGMA_SECURE_DELETE,
    PRAGMA_SYNCHRONOUS,
    PRAGMA_TEMP_STORE,
    SCHEMA_VERSION,
    VALID_STRANDS,
)
from utils import get_logger

logger = get_logger("indexer")


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

CREATE TABLE IF NOT EXISTS database_metadata (
    schema_version INTEGER NOT NULL,
    generator_version TEXT NOT NULL
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

INSERT_DATABASE_METADATA = """
INSERT INTO database_metadata (schema_version, generator_version)
VALUES (?, ?);
"""


class DatabaseBuilder:
    def __init__(self, db_path: str, use_prefix: bool = False):
        self.db_path = db_path
        self.use_prefix = use_prefix

    def prepare(self) -> sqlite3.Connection:
        os.makedirs(os.path.dirname(os.path.abspath(self.db_path)), exist_ok=True)

        if os.path.exists(self.db_path):
            os.remove(self.db_path)

        conn = sqlite3.connect(self.db_path)
        cur = conn.cursor()

        # Fast bulk-build settings using constants from config
        cur.execute(f"PRAGMA journal_mode = {PRAGMA_JOURNAL_MODE};")
        cur.execute(f"PRAGMA synchronous = {PRAGMA_SYNCHRONOUS};")
        cur.execute(f"PRAGMA temp_store = {PRAGMA_TEMP_STORE};")
        cur.execute(f"PRAGMA locking_mode = {PRAGMA_LOCKING_MODE};")
        cur.execute(f"PRAGMA secure_delete = {PRAGMA_SECURE_DELETE};")
        cur.execute(f"PRAGMA page_size = {PAGE_SIZE};")
        cur.execute(f"PRAGMA cache_size = {PRAGMA_CACHE_SIZE};")

        cur.executescript(make_schema(self.use_prefix))
        cur.execute(INSERT_DATABASE_METADATA, (SCHEMA_VERSION, GENERATOR_VERSION))
        conn.commit()

        return conn


class FeatureRepository:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = self.conn.cursor()

    def insert_batch(self, meta_batch: list[tuple], fts_batch: list[tuple]) -> None:
        if meta_batch:
            self.cur.executemany(INSERT_META, meta_batch)
        if fts_batch:
            self.cur.executemany(INSERT_FTS, fts_batch)

    def optimize(self, vacuum: bool = True) -> None:
        self.conn.commit()

        logger.info("Optimizing FTS...")
        self.cur.execute("INSERT INTO search_fts(search_fts) VALUES ('optimize');")
        self.conn.commit()

        logger.info("Running ANALYZE...")
        self.cur.execute("ANALYZE;")
        self.conn.commit()

        if vacuum:
            logger.info("Vacuuming database...")
            self.cur.execute("VACUUM;")
            self.conn.commit()


class DatabaseVerifier:
    def __init__(self, conn: sqlite3.Connection):
        self.conn = conn
        self.cur = self.conn.cursor()

    def verify(self, expected_rows: int) -> None:
        """Post-build verification: query actual DB to assert data integrity."""
        logger.info("Verifying database integrity...")
        errors = []

        # 1. Row count matches what the indexer tracked
        meta_count = self.cur.execute("SELECT count(*) FROM feature_meta").fetchone()[0]
        if meta_count != expected_rows:
            errors.append(
                f"Row count mismatch: feature_meta has {meta_count}, expected {expected_rows}"
            )

        # 2. feature_meta and search_fts have the same row counts
        fts_count = self.cur.execute("SELECT count(*) FROM search_fts").fetchone()[0]
        if meta_count != fts_count:
            errors.append(
                f"Table count mismatch: feature_meta={meta_count}, search_fts={fts_count}"
            )

        # 3. Max rowid is synced between tables
        meta_max = self.cur.execute("SELECT max(rowid) FROM feature_meta").fetchone()[0]
        fts_max = self.cur.execute("SELECT max(rowid) FROM search_fts").fetchone()[0]
        if meta_max != fts_max:
            errors.append(
                f"Rowid desync: feature_meta max={meta_max}, search_fts max={fts_max}"
            )

        # 4. No missing feature IDs
        null_ids = self.cur.execute(
            "SELECT count(*) FROM feature_meta WHERE feature_id IS NULL OR feature_id = ''"
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
        placeholders = ",".join("?" for _ in VALID_STRANDS)
        bad_strands = self.cur.execute(
            f"SELECT count(*) FROM feature_meta WHERE strand NOT IN ({placeholders})",
            VALID_STRANDS,
        ).fetchone()[0]
        if bad_strands > 0:
            errors.append(f"Found {bad_strands} rows with invalid strand values")

        # 7. Schema and generator metadata match this indexer.
        try:
            metadata_rows = self.cur.execute(
                "SELECT schema_version, generator_version FROM database_metadata"
            ).fetchall()
        except sqlite3.Error as exc:
            errors.append(f"Database metadata check failed: {exc}")
        else:
            expected_metadata = [(SCHEMA_VERSION, GENERATOR_VERSION)]
            if metadata_rows != expected_metadata:
                errors.append(
                    "Database metadata mismatch: "
                    f"found {metadata_rows!r}, expected {expected_metadata!r}"
                )

        # 8. FTS5 internal integrity check
        try:
            self.cur.execute(
                "INSERT INTO search_fts(search_fts) VALUES ('integrity-check')"
            )
        except sqlite3.Error as exc:
            errors.append(f"FTS5 integrity check failed: {exc}")

        if errors:
            error_msg = "Database verification FAILED:\n" + "\n".join(
                f"  - {e}" for e in errors
            )
            raise RuntimeError(error_msg)

        logger.info(f"Verification passed: 8 checks OK ({meta_count:,} rows)")
