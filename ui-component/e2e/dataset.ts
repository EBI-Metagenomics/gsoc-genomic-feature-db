export const accession = "MGYG000490722";
export const assetRoot = `/${accession}`;
export const runtimeAssets = {
  database: `${assetRoot}/${accession}.db.zip`,
  fasta: `${assetRoot}/${accession}.fna`,
  fastaIndex: `${assetRoot}/${accession}.fna.fai`,
  gff: `${assetRoot}/${accession}.gff.gz`,
  gffIndex: `${assetRoot}/${accession}.gff.gz.tbi`,
} as const;

export const rangedViewAssets = {
  database: runtimeAssets.database,
  fasta: runtimeAssets.fasta,
  gff: runtimeAssets.gff,
} as const;
