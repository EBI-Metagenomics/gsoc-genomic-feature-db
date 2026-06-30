class TestSchema:
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
        triggers = {
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='trigger'"
            ).fetchall()
        }
        assert len(triggers) == 0


class TestDataIntegrity:
    def test_feature_count_positive(self, conn):
        count = conn.execute("SELECT count(*) FROM feature_meta").fetchone()[0]
        assert count > 0

    def test_all_feature_ids_non_empty(self, conn):
        empty = conn.execute(
            "SELECT count(*) FROM feature_meta WHERE feature_id = '' OR feature_id IS NULL"
        ).fetchone()[0]
        assert empty == 0

    def test_known_gene_present(self, conn):
        row = conn.execute(
            "SELECT name, feature_type, seqid, start, end FROM feature_meta WHERE name = 'dnaA'"
        ).fetchone()
        assert row is not None
        assert row == ("dnaA", "gene", "contig_1", 1, 1386)

    def test_known_gene_wash7p(self, conn):
        row = conn.execute(
            "SELECT name, strand, seqid FROM feature_meta WHERE name = 'nfrA2' AND feature_type = 'gene'"
        ).fetchone()
        assert row is not None
        assert row == ("nfrA2", "-", "contig_1")

    def test_feature_types_present(self, conn):
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
        assert len(seqids) >= 1
        assert {"contig_1", "contig_2"} <= seqids

    def test_strand_values_valid(self, conn):
        from config import VALID_STRANDS

        strands = {
            r[0]
            for r in conn.execute("SELECT DISTINCT strand FROM feature_meta").fetchall()
        }
        assert strands <= set(VALID_STRANDS)

    def test_coordinates_positive(self, conn):
        bad = conn.execute(
            "SELECT count(*) FROM feature_meta WHERE start < 1 OR end < start"
        ).fetchone()[0]
        assert bad == 0

    def test_description_populated_for_genes(self, conn):
        rows = conn.execute(
            "SELECT name, description FROM feature_meta WHERE feature_type = 'gene' AND description != ''"
        ).fetchall()
        assert len(rows) > 0

    def test_functional_summary_populated(self, conn):
        rows = conn.execute(
            "SELECT name, functional_summary FROM feature_meta WHERE functional_summary IS NOT NULL AND functional_summary != ''"
        ).fetchall()
        assert len(rows) > 0
