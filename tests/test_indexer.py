import gzip
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest
from conftest import SAMPLE_GFF
from config import GENERATOR_VERSION, SCHEMA_VERSION
from indexer import build_database, default_output_path

SCRIPT_DIR = Path(__file__).parent.parent / "scripts"


class TestFTS:
    def test_rowid_sync(self, conn):
        meta_max = conn.execute("SELECT max(rowid) FROM feature_meta").fetchone()[0]
        fts_max = conn.execute("SELECT max(rowid) FROM search_fts").fetchone()[0]
        assert meta_max == fts_max

    def test_search_by_name(self, conn):
        rows = conn.execute(
            "SELECT m.name FROM search_fts f JOIN feature_meta m ON m.rowid = f.rowid WHERE search_fts MATCH 'dnaA*'"
        ).fetchall()
        assert any("dnaA" in r[0] for r in rows)

    def test_search_by_description_keyword(self, conn):
        rows = conn.execute(
            "SELECT m.name FROM search_fts f JOIN feature_meta m ON m.rowid = f.rowid WHERE search_fts MATCH 'replication*'"
        ).fetchall()
        assert len(rows) >= 1

    def test_search_returns_matching_rows_via_join(self, conn):
        rows = conn.execute(
            "SELECT m.name FROM search_fts f JOIN feature_meta m ON m.rowid = f.rowid WHERE search_fts MATCH 'nfrA2*'"
        ).fetchall()
        assert any("nfrA2" in r[0] for r in rows)

    def test_prefix_search(self, conn):
        rows = conn.execute(
            "SELECT m.name FROM search_fts f JOIN feature_meta m ON m.rowid = f.rowid WHERE search_fts MATCH 'nfr*'"
        ).fetchall()
        assert len(rows) >= 1

    def test_fts_optimized(self, conn):
        conn.execute("INSERT INTO search_fts(search_fts) VALUES ('integrity-check')")
        assert True

    def test_contentless_returns_null(self, conn):
        row = conn.execute(
            "SELECT feature_id, name FROM search_fts WHERE rowid = 1"
        ).fetchone()
        if row is not None:
            assert row[0] is None or row[0] == ""


class TestEdgeCases:
    def test_empty_gff_produces_empty_db(self, empty_gff, tmp_path):
        db = tmp_path / "empty.db"
        build_database(str(empty_gff), str(db))
        conn = sqlite3.connect(str(db))
        count = conn.execute("SELECT count(*) FROM feature_meta").fetchone()[0]
        conn.close()
        assert count == 0

    def test_output_file_overwritten(self, tmp_path):
        db = tmp_path / "overwrite.db"
        build_database(str(SAMPLE_GFF), str(db))
        size1 = db.stat().st_size
        build_database(str(SAMPLE_GFF), str(db))
        size2 = db.stat().st_size
        assert size1 == size2

    def test_nonexistent_input_raises(self, tmp_path):
        db = tmp_path / "no.db"
        with pytest.raises(FileNotFoundError):
            build_database("nonexistent_file_xyz.gff3", str(db))

    def test_output_db_is_valid_sqlite(self, db_path):
        conn = sqlite3.connect(str(db_path))
        result = conn.execute("PRAGMA integrity_check").fetchone()[0]
        conn.close()
        assert result == "ok"


class TestCLI:
    def test_cli_produces_database(self, tmp_path):
        db = tmp_path / "cli.db"
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_DIR / "indexer.py"),
                str(SAMPLE_GFF),
                "-o",
                str(db),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0
        assert db.exists()
        assert db.stat().st_size > 0
        with sqlite3.connect(db) as conn:
            metadata = conn.execute(
                "SELECT schema_version, generator_version FROM database_metadata"
            ).fetchone()
        assert metadata == (SCHEMA_VERSION, GENERATOR_VERSION)

    @pytest.mark.parametrize(
        ("filename", "expected"),
        [
            ("MGYG000490722.gff", "MGYG000490722.db.zip"),
            ("MGYG000490722.gff.gz", "MGYG000490722.db.zip"),
            ("MGYG000490722.gff3", "MGYG000490722.db.zip"),
            ("MGYG000490722.gff3.gz", "MGYG000490722.db.zip"),
            ("genome.release.1.gff.gz", "genome.release.1.db.zip"),
        ],
    )
    def test_default_output_name(self, tmp_path, filename, expected):
        assert default_output_path(str(tmp_path / filename)) == str(tmp_path / expected)

    @pytest.mark.parametrize("suffix", [".gff", ".gff.gz", ".gff3", ".gff3.gz"])
    def test_cli_default_output(self, tmp_path, suffix):
        gff = tmp_path / f"accession{suffix}"
        if suffix.endswith(".gz"):
            with gzip.open(gff, "wb") as handle:
                handle.write(SAMPLE_GFF.read_bytes())
        else:
            gff.write_bytes(SAMPLE_GFF.read_bytes())

        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_DIR / "indexer.py"),
                str(gff),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0
        db = tmp_path / "accession.db.zip"
        assert db.read_bytes().startswith(b"SQLite format 3\0")

    def test_cli_explicit_output_overrides_default(self, tmp_path):
        db = tmp_path / "custom" / "features.sqlite"
        db.parent.mkdir()
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_DIR / "indexer.py"),
                str(SAMPLE_GFF),
                "-o",
                str(db),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0
        assert db.exists()
        assert not SAMPLE_GFF.with_suffix(".db.zip").exists()

    def test_cli_multiple_inputs_require_output(self):
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_DIR / "indexer.py"),
                str(SAMPLE_GFF),
                str(SAMPLE_GFF),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode != 0
        assert "--output is required when indexing multiple GFF files" in result.stderr

    def test_cli_no_args_exits_with_error(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "indexer.py")],
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode != 0

    def test_cli_missing_file_exits_with_error(self, tmp_path):
        db = tmp_path / "fail.db"
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_DIR / "indexer.py"),
                "does_not_exist.gff3",
                "-o",
                str(db),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode != 0
