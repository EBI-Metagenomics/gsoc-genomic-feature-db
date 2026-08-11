import os

# Bump for reader-incompatible table, field, or semantic changes.
SCHEMA_VERSION = 1
# Bump when the indexer changes its generated output, even if readers stay compatible.
GENERATOR_VERSION = "1.0.0"

BATCH_SIZE = int(os.getenv("INDEXER_BATCH_SIZE", "150000"))

# Case-robust set of noisy feature types skipped in functional searches unless they carry annotations
LOW_VALUE_TYPES = {
    "exon",
    "region",
    "chromosome",
    "supercontig",
    "contig",
    "match",
    "match_part",
    "cdna_match",
    "est_match",
    "sequence_feature",
}

FUNCTIONAL_TAGS = [
    "dbxref",
    "ontology_term",
    "go",
    "ko",
    "kegg_ko",
    "kegg_pathway",
    "pathway",
    "gene_synonym",
    "alias",
    "locus_tag",
    "standard_name",
    "function",
    "pfam",
    "interpro",
    "kegg",
    "eggnog",
    "ec_number",
    "protein_id",
    "transcript_id",
    "inference",
    "experiment",
]

DESCRIPTION_KEYS = ["description", "product", "note"]
NAME_KEYS = ["name", "gene", "gene_name", "locus_tag", "standard_name"]
ID_KEYS = ["id", "locus_tag", "name", "protein_id", "transcript_id", "gene"]
BIOTYPE_KEYS = ["gene_biotype", "biotype", "transcript_biotype", "gbkey"]

PAGE_SIZE = 4096
PRAGMA_JOURNAL_MODE = "'OFF'"
PRAGMA_SYNCHRONOUS = "'OFF'"
PRAGMA_TEMP_STORE = "'MEMORY'"
PRAGMA_LOCKING_MODE = "'EXCLUSIVE'"
PRAGMA_SECURE_DELETE = "'OFF'"
PRAGMA_CACHE_SIZE = -300000

VALID_STRANDS = ("+", "-", ".", "?")
