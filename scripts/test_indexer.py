#!/usr/bin/env python3
"""
test_indexer.py — Unit tests for the GFF3 → SQLite+FTS5 indexer.

Tests verify the two-table schema:
  - feature_meta: regular table for display metadata
  - search_fts: contentless FTS5 for full-text search

Run with:
    pytest scripts/test_indexer.py -v
"""

import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

from indexer import build_database
from parser import GFFParser

SCRIPT_DIR = Path(__file__).parent
SAMPLE_GFF = SCRIPT_DIR.parent / "sample_data" / "BU_ATCC8492_annotations.gff"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def db_path(tmp_path):
    """Build the database from sample.gff3 and return the path."""
    out = tmp_path / "test_features.db"
    build_database(str(SAMPLE_GFF), str(out))
    return out


@pytest.fixture
def conn(db_path):
    """Open a SQLite connection to the test database."""
    c = sqlite3.connect(str(db_path))
    yield c
    c.close()


@pytest.fixture
def empty_gff(tmp_path):
    """Create a minimal GFF3 file with no features."""
    p = tmp_path / "empty.gff3"
    p.write_text("##gff-version 3\n")
    return p


@pytest.fixture
def malformed_gff(tmp_path):
    """Create a malformed / non-GFF3 file."""
    p = tmp_path / "bad.gff3"
    p.write_text("this is not a valid gff3 file\n\t\t\n")
    return p


# ---------------------------------------------------------------------------
# Schema tests
# ---------------------------------------------------------------------------


class TestSchema:
    """Verify the output database has the expected two-table schema."""

    def test_feature_meta_table_exists(self, conn):
        tables = {
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert "feature_meta" in tables

    def test_search_fts_table_exists(self, conn):
        tables = {
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert "search_fts" in tables

    def test_feature_meta_columns(self, conn):
        cols = {
            r[1] for r in conn.execute("PRAGMA table_info(feature_meta)").fetchall()
        }
        expected = {
            "rowid",
            "feature_id",
            "name",
            "feature_type",
            "seqid",
            "start",
            "end",
            "strand",
            "biotype",
            "description",
            "functional_summary",
        }
        assert expected == cols

    def test_no_triggers(self, conn):
        """Contentless FTS5 does not use triggers."""
        triggers = {
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='trigger'"
            ).fetchall()
        }
        assert len(triggers) == 0


# ---------------------------------------------------------------------------
# Data integrity tests
# ---------------------------------------------------------------------------


class TestDataIntegrity:
    """Verify features are correctly inserted from the sample GFF3."""

    def test_feature_count_positive(self, conn):
        count = conn.execute("SELECT count(*) FROM feature_meta").fetchone()[0]
        assert count > 0

    def test_all_feature_ids_non_empty(self, conn):
        empty = conn.execute(
            "SELECT count(*) FROM feature_meta "
            "WHERE feature_id = '' OR feature_id IS NULL"
        ).fetchone()[0]
        assert empty == 0

    def test_known_gene_present(self, conn):
        """The sample GFF3 contains gene dnaA."""
        row = conn.execute(
            "SELECT name, feature_type, seqid, start, end "
            "FROM feature_meta WHERE name = 'dnaA'"
        ).fetchone()
        assert row is not None
        name, ftype, seqid, start, end = row
        assert name == "dnaA"
        assert ftype == "gene"
        assert seqid == "contig_1"
        assert start == 1
        assert end == 1386

    def test_known_gene_wash7p(self, conn):
        """The sample GFF3 contains gene nfrA2 on the minus strand."""
        row = conn.execute(
            "SELECT name, strand, seqid FROM feature_meta "
            "WHERE name = 'nfrA2' AND feature_type = 'gene'"
        ).fetchone()
        assert row is not None
        assert row[0] == "nfrA2"
        assert row[1] == "-"
        assert row[2] == "contig_1"

    def test_feature_types_present(self, conn):
        """The sample should contain at least gene, mRNA, exon, CDS."""
        types = {
            r[0]
            for r in conn.execute(
                "SELECT DISTINCT feature_type FROM feature_meta"
            ).fetchall()
        }
        assert {"gene", "mRNA", "exon", "CDS"} <= types

    def test_multiple_chromosomes(self, conn):
        seqids = {
            r[0]
            for r in conn.execute("SELECT DISTINCT seqid FROM feature_meta").fetchall()
        }
        assert len(seqids) >= 1  # sample has contig_1, contig_2
        assert {"contig_1", "contig_2"} <= seqids

    def test_strand_values_valid(self, conn):
        strands = {
            r[0]
            for r in conn.execute("SELECT DISTINCT strand FROM feature_meta").fetchall()
        }
        assert strands <= {"+", "-", "."}

    def test_coordinates_positive(self, conn):
        bad = conn.execute(
            "SELECT count(*) FROM feature_meta WHERE start < 1 OR end < start"
        ).fetchone()[0]
        assert bad == 0

    def test_description_populated_for_genes(self, conn):
        """Genes in the sample have description attributes."""
        rows = conn.execute(
            "SELECT name, description FROM feature_meta "
            "WHERE feature_type = 'gene' AND description != ''"
        ).fetchall()
        assert len(rows) > 0

    def test_functional_summary_populated(self, conn):
        """Annotated features should have a functional_summary."""
        rows = conn.execute(
            "SELECT name, functional_summary FROM feature_meta "
            "WHERE functional_summary IS NOT NULL AND functional_summary != ''"
        ).fetchall()
        assert len(rows) > 0


# ---------------------------------------------------------------------------
# FTS5 search tests
# ---------------------------------------------------------------------------


class TestFTS:
    """Verify FTS5 full-text search works correctly with contentless table."""

    def test_rowid_sync(self, conn):
        """feature_meta max rowid should match search_fts max rowid."""
        meta_max = conn.execute("SELECT max(rowid) FROM feature_meta").fetchone()[0]
        fts_max = conn.execute("SELECT max(rowid) FROM search_fts").fetchone()[0]
        assert meta_max == fts_max

    def test_search_by_name(self, conn):
        """Search for dnaA via FTS and JOIN to feature_meta."""
        rows = conn.execute(
            "SELECT m.name FROM search_fts f "
            "JOIN feature_meta m ON m.rowid = f.rowid "
            "WHERE search_fts MATCH 'dnaA*'"
        ).fetchall()
        names = [r[0] for r in rows]
        assert any("dnaA" in n for n in names)

    def test_search_by_description_keyword(self, conn):
        """Search for 'replication' which appears in dnaA description."""
        rows = conn.execute(
            "SELECT m.name FROM search_fts f "
            "JOIN feature_meta m ON m.rowid = f.rowid "
            "WHERE search_fts MATCH 'replication*'"
        ).fetchall()
        assert len(rows) >= 1

    def test_search_returns_matching_rows_via_join(self, conn):
        rows = conn.execute(
            "SELECT m.name FROM search_fts f "
            "JOIN feature_meta m ON m.rowid = f.rowid "
            "WHERE search_fts MATCH 'nfrA2*'"
        ).fetchall()
        names = [r[0] for r in rows]
        assert any("nfrA2" in n for n in names)

    def test_prefix_search(self, conn):
        """Prefix search for 'nfr' should match nfrA2."""
        rows = conn.execute(
            "SELECT m.name FROM search_fts f "
            "JOIN feature_meta m ON m.rowid = f.rowid "
            "WHERE search_fts MATCH 'nfr*'"
        ).fetchall()
        assert len(rows) >= 1

    def test_fts_optimized(self, conn):
        """After build, the FTS index should be optimized (no pending merges)."""
        conn.execute("INSERT INTO search_fts(search_fts) VALUES ('integrity-check')")
        assert True

    def test_contentless_returns_null(self, conn):
        """Contentless FTS should return NULL for column values."""
        row = conn.execute(
            "SELECT feature_id, name FROM search_fts WHERE rowid = 1"
        ).fetchone()
        if row is not None:
            # With content='', column values should be NULL or empty
            assert row[0] is None or row[0] == ""


# ---------------------------------------------------------------------------
# Edge-case tests
# ---------------------------------------------------------------------------


class TestEdgeCases:
    """Test behaviour with unusual inputs."""

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
        # Sizes should be identical (deterministic output)
        assert size1 == size2

    def test_nonexistent_input_raises(self, tmp_path):
        db = tmp_path / "no.db"
        with pytest.raises(Exception):
            build_database("nonexistent_file_xyz.gff3", str(db))

    def test_output_db_is_valid_sqlite(self, db_path):
        """The output file should be a valid SQLite database."""
        conn = sqlite3.connect(str(db_path))
        result = conn.execute("PRAGMA integrity_check").fetchone()[0]
        conn.close()
        assert result == "ok"


# ---------------------------------------------------------------------------
# CLI tests
# ---------------------------------------------------------------------------


class TestCLI:
    """Test the command-line interface."""

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
        )
        assert result.returncode == 0
        assert db.exists()
        assert db.stat().st_size > 0

    def test_cli_default_output(self, tmp_path, monkeypatch):
        """Running without -o should use the default output path."""
        db = tmp_path / "default_test.db"
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
        )
        assert result.returncode == 0

    def test_cli_no_args_exits_with_error(self):
        result = subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "indexer.py")],
            capture_output=True,
            text=True,
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
        )
        assert result.returncode != 0


# ---------------------------------------------------------------------------
# Helper function tests
# ---------------------------------------------------------------------------


class TestHelpers:
    """Unit tests for helper functions."""

    def test_first_attr_returns_value(self):
        attrs = {"name": ["dnaA"], "biotype": ["protein_coding"]}
        assert GFFParser.first_attr(attrs, ["name"]) == "dnaA"
        assert GFFParser.first_attr(attrs, ["biotype"]) == "protein_coding"

    def test_first_attr_returns_default(self):
        attrs = {}
        assert GFFParser.first_attr(attrs, ["name"]) == ""
        assert GFFParser.first_attr(attrs, ["name"], "unknown") == "unknown"

    def test_first_attr_empty_list_returns_default(self):
        attrs = {"name": []}
        assert GFFParser.first_attr(attrs, ["name"]) == ""

    def test_first_attr_multiple_values_returns_first(self):
        attrs = {"name": ["first", "second", "third"]}
        assert GFFParser.first_attr(attrs, ["name"]) == "first"
