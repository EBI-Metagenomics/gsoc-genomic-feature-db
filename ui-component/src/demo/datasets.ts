import type { GenomicDataset } from "../types";

const baseUrl = import.meta.env.BASE_URL;
const benchmarkDatabaseUrl = import.meta.env.VITE_BENCHMARK_DATABASE_URL;
const benchmarkDatabaseSize = Number(import.meta.env.VITE_BENCHMARK_DATABASE_SIZE_BYTES);

/** Local/demo registry only. Production hosts should supply GenomicDataset URLs. */
export const DEMO_DATASETS: Record<string, GenomicDataset> = {
  MGYG000490722: {
    accession: "MGYG000490722",
    databaseUrl: benchmarkDatabaseUrl || `${baseUrl}MGYG000490722/MGYG000490722.db.zip`,
    databaseSizeBytes:
      benchmarkDatabaseUrl && Number.isSafeInteger(benchmarkDatabaseSize)
        ? benchmarkDatabaseSize
        : 15_581_184,
    databaseSha256: benchmarkDatabaseUrl
      ? undefined
      : "cc38d6ca17b78717037bd4486daaad620f57c1b0f9b578de45d8b81a55cff316",
    fastaUrl: `${baseUrl}MGYG000490722/MGYG000490722.fna`,
    fastaIndexUrl: `${baseUrl}MGYG000490722/MGYG000490722.fna.fai`,
    gffUrl: `${baseUrl}MGYG000490722/MGYG000490722.gff.gz`,
    gffIndexUrl: `${baseUrl}MGYG000490722/MGYG000490722.gff.gz.tbi`,
    initialLocation: "MGYG000490722_1:1..5000",
  },
};

export const DEMO_ACCESSIONS = Object.keys(DEMO_DATASETS);
