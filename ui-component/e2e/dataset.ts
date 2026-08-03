export const accession = "MGYG000490722";
export const assetRoot = `/${accession}`;
export const runtimeAssets = {
  database: `${assetRoot}/${accession}.db.zip`,
  fasta: `${assetRoot}/${accession}.fna`,
  gff: `${assetRoot}/${accession}.gff.gz`,
} as const;
