/** Exact host-resolved URLs for one active genomic accession. */
export interface GenomicDataset {
  /** Stable accession used for JBrowse assembly and track identifiers. */
  accession: string;
  /** URL of the raw SQLite database carrying a `.db.zip` delivery suffix. */
  databaseUrl: string;
  /** Optional expected byte length used to reject incomplete or changed database content. */
  databaseSizeBytes?: number;
  /** Optional SHA-256 digest used to verify the explicit full-download fallback. */
  databaseSha256?: string;
  /** URL of the uncompressed reference FASTA. */
  fastaUrl: string;
  /** URL of the FASTA `.fai` index. */
  fastaIndexUrl: string;
  /** URL of the BGZF-compressed GFF. */
  gffUrl: string;
  /** URL of the GFF tabix index. */
  gffIndexUrl: string;
  /** Tabix index format; defaults to `TBI`. */
  gffIndexType?: "TBI" | "CSI";
  /** Optional initial JBrowse location string. */
  initialLocation?: string;
}

/** One indexed GFF feature returned by browser-local SQLite search. */
export interface GenomicFeature {
  /** SQLite row identifier. */
  id: number;
  /** Stable identifier from the GFF attributes. */
  feature_id: string;
  /** Human-readable feature name, when present. */
  name: string;
  /** GFF feature type. */
  feature_type: string;
  /** Reference sequence identifier. */
  seqid: string;
  /** One-based inclusive GFF start coordinate. */
  start: number;
  /** One-based inclusive GFF end coordinate. */
  end: number;
  /** GFF strand symbol. */
  strand: string;
  /** Biological type annotation, when present. */
  biotype: string;
  /** Feature description, when present. */
  description: string;
  /** Compact functional annotation summary. */
  functional_summary: string;
}

/** Properties for the composed search and linear-genome browser. */
export interface GenomicFeatureBrowserProps {
  /** Exact URLs for the single active accession. */
  dataset: GenomicDataset;
  /** Maximum JBrowse viewport height in pixels; defaults to 450. */
  browserHeight?: number;
  /** Context added to both sides of a selected feature. */
  navigationFlankBp?: number;
  /** Optional class added to the project-owned outer shell. */
  className?: string;
  /** Called after a search result is selected for navigation. */
  onFeatureSelect?: (feature: GenomicFeature) => void;
}
