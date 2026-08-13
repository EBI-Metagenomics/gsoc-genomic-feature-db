import gzip
import hashlib
import json
import sqlite3
import subprocess
import sys
from contextlib import closing
from pathlib import Path

import pytest
import indexer
from conftest import SAMPLE_GFF
from config import GENERATOR_VERSION, SCHEMA_VERSION
from indexer import build_database, default_output_path

SCRIPT_DIR = Path(__file__).parent.parent / "scripts"


def write_gff(path: Path, *records: str) -> Path:
    path.write_text("##gff-version 3\n" + "\n".join(records) + "\n", encoding="utf-8")
    return path


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
        assert not db.exists()

    def test_all_inputs_are_validated_before_existing_output_is_touched(self, tmp_path):
        gff = write_gff(
            tmp_path / "valid.gff3",
            "seq-A\tsource\tgene\t1\t4\t.\t+\t.\tID=stable",
        )
        db = tmp_path / "stable.db"
        build_database(str(gff), str(db), vacuum=False)
        original_database = db.read_bytes()

        with pytest.raises(FileNotFoundError):
            build_database([str(gff), str(tmp_path / "missing.gff3")], str(db))

        assert db.read_bytes() == original_database
        assert list(tmp_path.glob(f".{db.name}.*.tmp")) == []

    def test_duplicate_feature_ids_are_retained_as_independent_rows(self, tmp_path):
        gff = write_gff(
            tmp_path / "duplicates.gff3",
            "contig_1\tsource\tgene\t1\t5\t.\t+\t.\tID=shared;Name=first",
            "contig_1\tsource\tgene\t8\t12\t.\t-\t.\tID=shared;Name=second",
        )
        db = tmp_path / "duplicates.db"

        build_database(str(gff), str(db), vacuum=False)

        with closing(sqlite3.connect(db)) as connection:
            rows = connection.execute(
                "SELECT rowid, feature_id, name, start, end "
                "FROM feature_meta ORDER BY rowid"
            ).fetchall()
            matching_rowids = connection.execute(
                "SELECT m.rowid FROM search_fts f "
                "JOIN feature_meta m ON m.rowid = f.rowid "
                "WHERE search_fts MATCH 'shared' ORDER BY m.rowid"
            ).fetchall()

        assert rows == [
            (1, "shared", "first", 1, 5),
            (2, "shared", "second", 8, 12),
        ]
        assert matching_rowids == [(1,), (2,)]

    def test_parent_attribute_stays_outside_search_database_relationships(
        self, tmp_path
    ):
        gff = write_gff(
            tmp_path / "relationships.gff3",
            "contig_1\tsource\tgene\t1\t20\t.\t+\t.\tID=parent1;Name=parent",
            "contig_1\tsource\tmRNA\t3\t18\t.\t+\t.\t"
            "ID=child1;Name=child;Parent=parent1",
        )
        db = tmp_path / "relationships.db"

        build_database(str(gff), str(db), vacuum=False)

        with closing(sqlite3.connect(db)) as connection:
            rows = connection.execute(
                "SELECT feature_id, name FROM feature_meta ORDER BY rowid"
            ).fetchall()
            columns = {
                row[1] for row in connection.execute("PRAGMA table_info(feature_meta)")
            }
            child_matches = connection.execute(
                "SELECT count(*) FROM search_fts WHERE search_fts MATCH 'child1'"
            ).fetchone()[0]

        assert rows == [("parent1", "parent"), ("child1", "child")]
        assert "parent" not in columns
        assert child_matches == 1

    def test_valid_coordinate_boundaries_are_stored_unchanged(self, tmp_path):
        gff = write_gff(
            tmp_path / "valid-coordinates.gff3",
            "seq-A\tsource\tgene\t1\t5\t.\t+\t.\tID=starts-at-one",
            "seq-A\tsource\tgene\t7\t7\t.\t+\t.\tID=single-base",
            "seq-A\tsource\tgene\t2147483647\t2147483647\t.\t+\t.\tID=large",
        )
        db = tmp_path / "valid-coordinates.db"

        build_database(str(gff), str(db), vacuum=False)

        with closing(sqlite3.connect(db)) as connection:
            coordinates = connection.execute(
                "SELECT feature_id, seqid, start, end "
                "FROM feature_meta ORDER BY rowid"
            ).fetchall()

        assert coordinates == [
            ("starts-at-one", "seq-A", 1, 5),
            ("single-base", "seq-A", 7, 7),
            ("large", "seq-A", 2147483647, 2147483647),
        ]

    @pytest.mark.parametrize(
        ("start", "end"),
        [("0", "1"), ("-1", "1"), ("3", "2")],
    )
    def test_invalid_coordinate_boundaries_fail_verification(
        self, tmp_path, start, end
    ):
        gff = write_gff(
            tmp_path / f"invalid-{start}-{end}.gff3",
            f"seq-A\tsource\tgene\t{start}\t{end}\t.\t+\t.\tID=invalid",
        )
        db = tmp_path / "invalid-coordinates.db"

        with pytest.raises(RuntimeError, match="invalid coordinates"):
            build_database(str(gff), str(db), vacuum=False)

        assert not db.exists()

    def test_fasta_section_terminates_indexing(self, tmp_path):
        gff = tmp_path / "with-fasta.gff3"
        gff.write_text(
            "##gff-version 3\n"
            "seq-A\tsource\tgene\t1\t4\t.\t+\t.\tID=before-fasta\n"
            "##FASTA\n"
            ">seq-A\n"
            "ACGT\n"
            "seq-A\tsource\tgene\t8\t9\t.\t+\t.\tID=after-fasta\n",
            encoding="utf-8",
        )
        db = tmp_path / "with-fasta.db"

        build_database(str(gff), str(db), vacuum=False)

        with closing(sqlite3.connect(db)) as connection:
            ids = connection.execute(
                "SELECT feature_id FROM feature_meta ORDER BY rowid"
            ).fetchall()
        assert ids == [("before-fasta",)]

    @pytest.mark.parametrize("exception_type", [RuntimeError, KeyboardInterrupt])
    def test_failed_build_preserves_destination_and_removes_temporary_file(
        self, tmp_path, monkeypatch, exception_type
    ):
        gff = write_gff(
            tmp_path / "valid.gff3",
            "seq-A\tsource\tgene\t1\t4\t.\t+\t.\tID=stable",
        )
        db = tmp_path / "stable.db"
        build_database(str(gff), str(db), vacuum=False)
        original_database = db.read_bytes()

        def fail_verification(self, expected_rows):
            raise exception_type("injected verification failure")

        monkeypatch.setattr(indexer.DatabaseVerifier, "verify", fail_verification)

        with pytest.raises(exception_type, match="injected verification failure"):
            build_database(str(gff), str(db), vacuum=False)

        assert db.read_bytes() == original_database
        assert list(tmp_path.glob(f".{db.name}.*.tmp")) == []

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
        with closing(sqlite3.connect(db)) as conn:
            metadata = conn.execute(
                "SELECT schema_version, generator_version FROM database_metadata"
            ).fetchone()
        assert metadata == (SCHEMA_VERSION, GENERATOR_VERSION)

    def test_cli_reports_reproducible_audit_summary(self, tmp_path):
        gff = write_gff(
            tmp_path / "summary.gff3",
            "seq-A\tsource\tgene\t1\t4\t.\t+\t.\tID=kept-gene",
            "seq-A\tsource\tgene\t1\t4\t.\t+\t.",
            "seq-A\tsource\tgene\tnot-an-int\t4\t.\t+\t.\tID=bad-coordinate",
            "seq-A\tsource\texon\t1\t4\t.\t+\t.\tID=quiet-exon",
            "seq-A\tsource\tgene\t1\t4\t.\t+\t.\t.",
            "seq-B\tsource\tCDS\t8\t12\t.\t-\t.\tID=kept-cds",
        )
        db = tmp_path / "summary.db"

        result = subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "indexer.py"), str(gff), "-o", str(db)],
            capture_output=True,
            text=True,
            check=False,
        )

        assert result.returncode == 0
        output = result.stdout + result.stderr
        assert "Feature rows examined: 6" in output
        assert "Indexed searchable rows: 2" in output
        assert "Skipped rows: 4" in output
        assert "malformed columns=1" in output
        assert "non-integer coordinates=1" in output
        assert "low-value unannotated features=1" in output
        assert "features without identity or annotation=1" in output
        assert "Distinct sequences: 2" in output
        assert "Indexed feature types: CDS=1, gene=1" in output
        assert (
            f"Input SHA-256 ({gff}): {hashlib.sha256(gff.read_bytes()).hexdigest()}"
            in output
        )
        assert f"DB size: {db.stat().st_size:,} bytes" in output
        assert (
            f"Output SHA-256: {hashlib.sha256(db.read_bytes()).hexdigest()}" in output
        )

    def test_cli_writes_structured_statistics_without_changing_default_output(
        self, tmp_path
    ):
        gff = write_gff(
            tmp_path / "structured.gff3",
            "seq-A\tsource\tgene\t1\t4\t.\t+\t.\tID=kept;Name=kept",
            "seq-A\tsource\tgene\tbad\t4\t.\t+\t.\tID=skipped",
        )
        db = tmp_path / "structured.db"
        stats_path = tmp_path / "nested" / "stats.json"

        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_DIR / "indexer.py"),
                str(gff),
                "-o",
                str(db),
                "--no-vacuum",
                "--stats-json",
                str(stats_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )

        assert result.returncode == 0
        statistics = json.loads(stats_path.read_text(encoding="utf-8"))
        assert statistics["stats_schema_version"] == 1
        assert statistics["counts"] == {
            "distinct_sequences": 1,
            "feature_rows_examined": 2,
            "indexed_rows": 1,
            "skipped_rows": 1,
        }
        assert statistics["skip_reasons"]["malformed_coordinates"] == 1
        assert statistics["feature_type_distribution"] == {"gene": 1}
        assert statistics["configuration"]["vacuum"] is False
        assert statistics["output"]["size_bytes"] == db.stat().st_size
        assert (
            statistics["output"]["sha256"]
            == hashlib.sha256(db.read_bytes()).hexdigest()
        )
        assert (
            statistics["inputs"][0]["sha256"]
            == hashlib.sha256(gff.read_bytes()).hexdigest()
        )
        assert statistics["environment"]["python_version"]
        assert statistics["environment"]["sqlite_version"]
        assert statistics["duration_seconds"] >= 0

    def test_cli_does_not_write_statistics_after_failed_build(self, tmp_path):
        stats_path = tmp_path / "failed.json"
        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT_DIR / "indexer.py"),
                "missing.gff3",
                "--stats-json",
                str(stats_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )

        assert result.returncode != 0
        assert not stats_path.exists()

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
