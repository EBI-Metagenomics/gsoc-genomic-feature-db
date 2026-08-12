import type { GenomicDataset } from "../types";

const baseUrl = import.meta.env.BASE_URL;

/** Local/demo registry only. Production hosts should supply GenomicDataset URLs. */
export const DEMO_DATASETS: Record<string, GenomicDataset> = {
  MGYG000490722: {
    accession: "MGYG000490722",
    databaseUrl: `${baseUrl}MGYG000490722/MGYG000490722.db.zip`,
    databaseSizeBytes: 18_558_976,
    databaseSha256: "6f486bd3ebcad27a4f1e7968fc06fafac349ed21889058ff9e72e2b67ce26e28",
    fastaUrl: `${baseUrl}MGYG000490722/MGYG000490722.fna`,
    fastaIndexUrl: `${baseUrl}MGYG000490722/MGYG000490722.fna.fai`,
    gffUrl: `${baseUrl}MGYG000490722/MGYG000490722.gff.gz`,
    gffIndexUrl: `${baseUrl}MGYG000490722/MGYG000490722.gff.gz.tbi`,
    initialLocation: "MGYG000490722_1:1..5000",
  },
};

export const DEMO_ACCESSIONS = Object.keys(DEMO_DATASETS);
