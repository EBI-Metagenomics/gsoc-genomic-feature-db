# Issue #14 reproducible performance baseline

Status: **formal baseline**.

This report is generated from machine-readable indexer and Playwright results. The commands in `benchmark/README.md` are the reproducibility contract.

## Environment

- Platform: `Windows-11-10.0.26200-SP0`
- Processor: `AMD64 Family 25 Model 116 Stepping 1, AuthenticAMD`
- CPU cores: 8 physical / 16 logical
- Memory: 15556.55 MiB
- Python: `3.13.14`
- psutil: `7.0.0`
- Node.js: `v26.4.0`
- npm: `11.17.0`
- Playwright: `1.62.0`
- Browser: `chromium 151.0.4129.78`
- SQLite WASM: `3.51.2-build6`
- sqlite-wasm-http: `1.2.0`
- Vite: `5.4.21`
- Native SQLite: `3.50.4`
- Git commit: `7ac4e389f2e2a9543fcc87e69e7c3ce298e35dab`
- Benchmark date (UTC): `2026-08-13T10:34:05.322149+00:00`

## Dataset and indexer baseline

| Role | Dataset | Compressed GFF | Uncompressed GFF | Source features | Sequences | Indexed | Skipped | Index time | Peak RSS | SQLite size |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| small | `MGYG000490722` | 2.52 MiB | 24.25 MiB | 179,889 | 193 | 134,741 | 45,148 | 2.41 s | 134.64 MiB | 17.70 MiB |
| medium | `GCF_000001215.4` | 8.29 MiB | 157.35 MiB | 414,876 | 1,870 | 414,876 | 0 | 12.85 s | 451.36 MiB | 130.13 MiB |
| large | `GENCODE-v49-GRCh38` | 118.04 MiB | 3316.46 MiB | 8,060,457 | 528 | 8,060,457 | 0 | 186.58 s | 1893.93 MiB | 1253.91 MiB |

### Feature and annotation distributions

#### Small: `MGYG000490722`

Feature types: `CDS`=45,148, `exon`=45,148, `intron`=29,035, `mRNA`=16,147, `start_codon`=16,128, `stop_codon`=16,115, `gene`=12,041, `tRNA`=82, `rRNA`=23, `ncRNA`=22.

Annotation fields: `id`=179,889, `parent`=167,721, `product`=45,193, `product_source`=36,432, `interpro`=34,901, `pfam`=28,298, `dbcan_prot_family`=2,558, `substrate_dbcan-sub`=2,558, `ec_number`=1,525, `anticodon`=82, `gene_biotype`=82, `isotype`=82, `name`=82, `inference`=45, `locus_tag`=45, `rfam`=45, `eggnog`=44, `cog`=43, `kegg`=27, `ncrna_class`=22.

#### Medium: `GCF_000001215.4`

Feature types: `exon`=190,710, `CDS`=163,319, `mRNA`=30,802, `gene`=17,537, `mobile_genetic_element`=5,734, `lnc_RNA`=2,374, `region`=1,870, `antisense_RNA`=621, `miRNA`=485, `pseudogene`=339, `tRNA`=317, `snoRNA`=270, `primary_transcript`=266, `rRNA`=134, `ncRNA`=60, `snRNA`=32, `RNase_P_RNA`=2, `SRP_RNA`=2, `RNase_MRP_RNA`=1, `sequence_feature`=1.

Annotation fields: `dbxref`=414,876, `gbkey`=414,876, `id`=414,876, `gene`=407,271, `locus_tag`=407,271, `parent`=389,395, `product`=388,806, `orig_transcript_id`=388,152, `note`=228,239, `transcript_id`=223,815, `name`=217,591, `orig_protein_id`=214,429, `protein_id`=163,319, `gene_biotype`=17,876, `gene_synonym`=17,876, `cyt_map`=17,690, `gen_map`=17,687, `description`=10,244, `mobile_element_type`=5,734, `partial`=4,423, `exception`=3,645, `transl_except`=3,564, `genome`=1,870, `mol_type`=1,870, `chromosome`=1,869, `genotype`=1,869, `end_range`=1,843, `start_range`=1,605, `pseudo`=971, `old_locus_tag`=789, `map`=645, `exon_number`=563, `number`=563, `inference`=485, `part`=136, `transl_table`=13, `codons`=2, `is_circular`=1.

#### Large: `GENCODE-v49-GRCh38`

Feature types: `exon`=3,823,521, `CDS`=2,364,762, `transcript`=533,740, `five_prime_UTR`=441,410, `three_prime_UTR`=355,340, `start_codon`=231,248, `stop_codon`=223,936, `gene`=86,369, `stop_codon_redefined_as_selenocysteine`=131.

Annotation fields: `gene_id`=8,060,457, `gene_name`=8,060,457, `gene_type`=8,060,457, `id`=8,060,457, `level`=8,060,457, `parent`=7,974,088, `transcript_id`=7,974,088, `transcript_name`=7,974,088, `transcript_type`=7,974,088, `havana_gene`=7,548,111, `hgnc_id`=7,466,768, `exon_id`=7,440,217, `exon_number`=7,440,217, `tag`=7,433,837, `protein_id`=6,579,985, `havana_transcript`=2,842,453, `transcript_support_level`=2,695,378, `ccdsid`=2,514,247, `ont`=47,465, `artif_dupl`=19.

## Browser baseline

| Dataset | Metric | Median | p95 | Samples |
|---|---|---:|---:|---:|
| small | Worker database initialisation | 479.1 ms | 650.9 ms | 15 |
| small | Page to searchable UI | 1585.0 ms | 7929.8 ms | 15 |
| small | Initialisation long-task duration | 343.0 ms | 361.0 ms | 15 |
| small | Initialisation JS heap | 27.99 MiB | 33.24 MiB | 15 |
| small | Search long-task duration | 0.0 ms | 0.0 ms | 65 |
| small | Search JS heap | 31.07 MiB | 39.31 MiB | 65 |
| small | cold `protein` (broad_keyword), visible | 125.8 ms | 135.0 ms | 3 |
| small | cold `protein` (broad_keyword), worker | 63.6 ms | 64.3 ms | 3 |
| small | cold `MGYG000490722_00001` (exact_identifier), visible | 74.0 ms | 82.2 ms | 3 |
| small | cold `MGYG000490722_00001` (exact_identifier), worker | 37.7 ms | 40.3 ms | 3 |
| small | cold `Ski3/TTC37` (few_results), visible | 69.9 ms | 75.5 ms | 3 |
| small | cold `Ski3/TTC37` (few_results), worker | 43.9 ms | 48.3 ms | 3 |
| small | cold `MGYG000490722_000` (identifier_prefix), visible | 89.8 ms | 124.1 ms | 3 |
| small | cold `MGYG000490722_000` (identifier_prefix), worker | 47.1 ms | 52.6 ms | 3 |
| small | cold `pfam:PF16499` (namespace_identifier), visible | 130.5 ms | 134.9 ms | 3 |
| small | cold `pfam:PF16499` (namespace_identifier), worker | 78.3 ms | 84.3 ms | 3 |
| small | warm `protein` (broad_keyword), visible | 51.9 ms | 75.9 ms | 10 |
| small | warm `protein` (broad_keyword), worker | 3.3 ms | 22.9 ms | 10 |
| small | warm `MGYG000490722_00001` (exact_identifier), visible | 52.7 ms | 65.6 ms | 10 |
| small | warm `MGYG000490722_00001` (exact_identifier), worker | 0.8 ms | 30.4 ms | 10 |
| small | warm `Ski3/TTC37` (few_results), visible | 52.1 ms | 59.7 ms | 10 |
| small | warm `Ski3/TTC37` (few_results), worker | 0.7 ms | 4.2 ms | 10 |
| small | warm `MGYG000490722_000` (identifier_prefix), visible | 48.4 ms | 76.7 ms | 10 |
| small | warm `MGYG000490722_000` (identifier_prefix), worker | 1.6 ms | 12.2 ms | 10 |
| small | warm `pfam:PF16499` (namespace_identifier), visible | 64.5 ms | 119.6 ms | 10 |
| small | warm `pfam:PF16499` (namespace_identifier), worker | 1.2 ms | 41.6 ms | 10 |
| medium | Worker database initialisation | 480.8 ms | 624.6 ms | 15 |
| medium | Page to searchable UI | 1593.6 ms | 7949.6 ms | 15 |
| medium | Initialisation long-task duration | 339.0 ms | 383.0 ms | 15 |
| medium | Initialisation JS heap | 28.10 MiB | 31.08 MiB | 15 |
| medium | Search long-task duration | 0.0 ms | 0.0 ms | 65 |
| medium | Search JS heap | 31.77 MiB | 43.91 MiB | 65 |
| medium | cold `kinase` (broad_keyword), visible | 127.6 ms | 130.7 ms | 3 |
| medium | cold `kinase` (broad_keyword), worker | 53.1 ms | 60.5 ms | 3 |
| medium | cold `FBgn0023169` (exact_identifier), visible | 79.8 ms | 106.6 ms | 3 |
| medium | cold `FBgn0023169` (exact_identifier), worker | 38.2 ms | 53.7 ms | 3 |
| medium | cold `NP_72673` (few_results), visible | 81.9 ms | 115.9 ms | 3 |
| medium | cold `NP_72673` (few_results), worker | 44.3 ms | 47.8 ms | 3 |
| medium | cold `FBgn` (identifier_prefix), visible | 237.7 ms | 237.9 ms | 3 |
| medium | cold `FBgn` (identifier_prefix), worker | 166.2 ms | 168.8 ms | 3 |
| medium | cold `GeneID:43904` (namespace_identifier), visible | 127.1 ms | 127.1 ms | 3 |
| medium | cold `GeneID:43904` (namespace_identifier), worker | 55.2 ms | 60.7 ms | 3 |
| medium | warm `kinase` (broad_keyword), visible | 51.1 ms | 78.5 ms | 10 |
| medium | warm `kinase` (broad_keyword), worker | 1.9 ms | 19.7 ms | 10 |
| medium | warm `FBgn0023169` (exact_identifier), visible | 45.6 ms | 73.2 ms | 10 |
| medium | warm `FBgn0023169` (exact_identifier), worker | 1.1 ms | 40.5 ms | 10 |
| medium | warm `NP_72673` (few_results), visible | 53.2 ms | 60.4 ms | 10 |
| medium | warm `NP_72673` (few_results), worker | 0.7 ms | 11.8 ms | 10 |
| medium | warm `FBgn` (identifier_prefix), visible | 115.2 ms | 228.9 ms | 10 |
| medium | warm `FBgn` (identifier_prefix), worker | 72.5 ms | 121.8 ms | 10 |
| medium | warm `GeneID:43904` (namespace_identifier), visible | 57.4 ms | 74.3 ms | 10 |
| medium | warm `GeneID:43904` (namespace_identifier), worker | 0.9 ms | 30.9 ms | 10 |
| large | Worker database initialisation | 481.3 ms | 639.3 ms | 15 |
| large | Page to searchable UI | 1590.7 ms | 7868.0 ms | 15 |
| large | Initialisation long-task duration | 337.0 ms | 365.0 ms | 15 |
| large | Initialisation JS heap | 28.01 MiB | 29.33 MiB | 15 |
| large | Search long-task duration | 0.0 ms | 0.0 ms | 65 |
| large | Search JS heap | 30.86 MiB | 37.44 MiB | 65 |
| large | cold `ENSG` (broad_keyword), visible | 343.7 ms | 348.3 ms | 3 |
| large | cold `ENSG` (broad_keyword), worker | 279.4 ms | 281.0 ms | 3 |
| large | cold `ENSG00000290825.2` (exact_identifier), visible | 66.0 ms | 69.0 ms | 3 |
| large | cold `ENSG00000290825.2` (exact_identifier), worker | 38.7 ms | 39.9 ms | 3 |
| large | cold `ENST00000832824.1` (few_results), visible | 68.0 ms | 80.7 ms | 3 |
| large | cold `ENST00000832824.1` (few_results), worker | 40.5 ms | 44.0 ms | 3 |
| large | cold `ENST000008` (identifier_prefix), visible | 860.6 ms | 861.9 ms | 3 |
| large | cold `ENST000008` (identifier_prefix), worker | 503.3 ms | 507.4 ms | 3 |
| large | cold `transcript_id:ENST00000832824.1` (namespace_identifier), visible | 124.2 ms | 136.8 ms | 3 |
| large | cold `transcript_id:ENST00000832824.1` (namespace_identifier), worker | 54.5 ms | 70.5 ms | 3 |
| large | warm `ENSG` (broad_keyword), visible | 332.1 ms | 350.3 ms | 10 |
| large | warm `ENSG` (broad_keyword), worker | 222.1 ms | 249.8 ms | 10 |
| large | warm `ENSG00000290825.2` (exact_identifier), visible | 50.8 ms | 67.6 ms | 10 |
| large | warm `ENSG00000290825.2` (exact_identifier), worker | 8.7 ms | 39.7 ms | 10 |
| large | warm `ENST00000832824.1` (few_results), visible | 58.0 ms | 67.5 ms | 10 |
| large | warm `ENST00000832824.1` (few_results), worker | 15.1 ms | 26.1 ms | 10 |
| large | warm `ENST000008` (identifier_prefix), visible | 849.9 ms | 867.7 ms | 10 |
| large | warm `ENST000008` (identifier_prefix), worker | 446.1 ms | 478.9 ms | 10 |
| large | warm `transcript_id:ENST00000832824.1` (namespace_identifier), visible | 53.5 ms | 59.3 ms | 10 |
| large | warm `transcript_id:ENST00000832824.1` (namespace_identifier), worker | 15.6 ms | 27.5 ms | 10 |

## Proposed quantitative targets

- Search responsiveness: visible-results p95 under **3,000 ms** for the canonical query matrix (20% headroom over this baseline, never below the existing 3,000 ms guard).
- Indexer reliability: every canonical input must complete verification with zero database-integrity errors and record process-tree peak RSS.
- Main-thread responsiveness: no search may introduce a task longer than 200 ms; investigate any p95 long-task total above 250 ms.
- Regressions: database output size, indexing time, peak RSS, and browser p95 may not worsen by more than 20% without documented evidence and mentor approval.

> These are proposals. Issue #14 remains open until mentors explicitly review and agree the targets.

## Acceptance status

- [x] Profiling can be rerun using documented commands.
- [x] Three representative input sizes were tested.
- [x] The large compressed input is greater than 100 MB.
- [x] Indexing time, peak memory and output size are recorded.
- [x] Browser initialisation and representative search latency are recorded.
- [ ] The baseline report and machine-readable results are generated and ready to commit in the Issue #14 pull request.
- [ ] Proposed performance targets require mentor review on Issue #14 or its pull request.
- [ ] Follow-up optimisation work must be linked to observed evidence if mentors request it.

## Historical context

The earlier manual Drosophila and NCBI GRCh38 reports remain supporting evidence. They showed that rowid keyset pagination materially reduced broad-query Range traffic, and that the paired `detail=none`/`columnsize=0` build reduced database size. They are not mixed into the formal statistics because their schema, repetitions and cache controls differ.

## Limitations and follow-up

- Browser results depend on hosting latency, Range support, browser version and cache state.
- Chromium JS heap is reported where the DevTools protocol exposes it; it is not total browser RSS.
- Long-task observation covers the page main thread, while SQLite runs in a worker.
- Link optimization issues only when the formal p95 or resource evidence identifies a bottleneck.
- Mentor review of proposed targets must be linked from Issue #14 before closure.
