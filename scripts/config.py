import os

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
ID_KEYS = ["id", "locus_tag", "protein_id", "transcript_id", "gene", "name"]
BIOTYPE_KEYS = ["gene_biotype", "biotype", "transcript_biotype", "gbkey"]
