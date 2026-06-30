from parser import GFFParser


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

    def test_dbxref_parsing(self):
        # Verify dbxref parsing for multiple values like Dbxref=COG:COG1560,UniProt:A7V706
        line = "contig_1\tProdigal:2.6\tCDS\t1\t1386\t.\t+\t0\tID=BU_ATCC8492_00001;Dbxref=COG:COG1560,UniProt:A7V706"
        parts = line.strip().split("\t")
        attrs = GFFParser.parse_attributes(parts[8])
        assert "COG:COG1560" in attrs.get("dbxref", [])
        assert "UniProt:A7V706" in attrs.get("dbxref", [])
