import pytest

from models import GenomicFeature
from parser import GFFParser


class TestHelpers:
    """Unit tests for parser helper functions."""

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

    def test_repeated_and_comma_separated_attributes_preserve_order(self):
        attrs = GFFParser.parse_attributes(
            "Dbxref=first%20value,second;Dbxref=third,fourth"
        )
        assert attrs["dbxref"] == ["first value", "second", "third", "fourth"]


class TestParseLine:
    def test_maps_all_genomic_feature_fields(self):
        line = (
            "Chr_01.2|alt\tRefSeq\tgene\t1\t42\t9.5\t-\t0\t"
            "ID=gene-1;Name=Alpha;gene_biotype=protein_coding;"
            "description=Primary%20enzyme;Dbxref=UniProt:P1;Alias=A1"
        )

        assert GFFParser.parse_line(line, generated_id=99) == GenomicFeature(
            feature_id="gene-1",
            name="Alpha",
            feature_type="gene",
            seqid="Chr_01.2|alt",
            start=1,
            end=42,
            strand="-",
            biotype="protein_coding",
            description="Primary enzyme",
            annotations="dbxref: UniProt:P1 | alias: A1",
            functional_summary="dbxref: UniProt:P1 | alias: A1",
        )

    def test_missing_optional_attributes_remain_empty(self):
        feature = GFFParser.parse_line(
            "contig_1\tsource\tgene\t2\t4\t.\t+\t.\tID=only-id", generated_id=1
        )

        assert feature is not None
        assert feature.feature_id == "only-id"
        assert feature.name == ""
        assert feature.biotype == ""
        assert feature.description == ""
        assert feature.annotations is None
        assert feature.functional_summary is None

    def test_missing_identifier_gets_deterministic_generated_id(self):
        feature = GFFParser.parse_line(
            "contig_1\tsource\tgene\t5\t8\t.\t.\t.\tNote=curated%20feature",
            generated_id=17,
        )

        assert feature is not None
        assert feature.feature_id == "generated_17"
        assert feature.description == "curated feature"
        assert feature.strand == "."

    @pytest.mark.parametrize(
        "line",
        [
            "contig_1\tsource\tgene\t1\t2\t.\t+\t.",
            "contig_1\tsource\tgene\tnot-an-int\t2\t.\t+\t.\tID=bad",
            "contig_1\tsource\tgene\t1\tnot-an-int\t.\t+\t.\tID=bad",
        ],
    )
    def test_structurally_short_or_non_integer_rows_are_skipped(self, line):
        assert GFFParser.parse_line(line, generated_id=1) is None

    @pytest.mark.parametrize(
        ("line", "expected_reason"),
        [
            (
                "contig_1\tsource\tgene\t1\t2\t.\t+\t.",
                GFFParser.MALFORMED_COLUMNS,
            ),
            (
                "contig_1\tsource\tgene\tnot-an-int\t2\t.\t+\t.\tID=bad",
                GFFParser.MALFORMED_COORDINATES,
            ),
            (
                "contig_1\tsource\texon\t1\t2\t.\t+\t.\tID=quiet-exon",
                GFFParser.FILTERED_LOW_VALUE,
            ),
            (
                "contig_1\tsource\tgene\t1\t2\t.\t+\t.\t.",
                GFFParser.FILTERED_UNIDENTIFIED,
            ),
        ],
    )
    def test_skipped_rows_report_a_specific_reason(self, line, expected_reason):
        feature, reason = GFFParser.parse_line_with_reason(line, generated_id=1)

        assert feature is None
        assert reason == expected_reason
