import { describe, expect, it } from "vitest";

import type { GenomicDataset } from "../types";
import { buildAnnotationTrack, buildAssembly, buildInitialSession } from "./config";

const dataset: GenomicDataset = {
  accession: "MGYG000490722",
  databaseUrl: "/MGYG000490722.db.zip",
  fastaUrl: "/MGYG000490722.fna",
  fastaIndexUrl: "/MGYG000490722.fna.fai",
  gffUrl: "/MGYG000490722.gff.gz",
  gffIndexUrl: "/MGYG000490722.gff.gz.tbi",
  initialLocation: "MGYG000490722_1:1..20000",
};

describe("JBrowse configuration", () => {
  it("builds an indexed FASTA assembly from exact URLs", () => {
    const assembly = buildAssembly(dataset);

    expect(assembly.name).toBe(dataset.accession);
    expect(assembly.sequence.adapter).toMatchObject({
      type: "IndexedFastaAdapter",
      fastaLocation: { uri: dataset.fastaUrl },
      faiLocation: { uri: dataset.fastaIndexUrl },
    });
  });

  it("builds a TBI-indexed GFF track by default", () => {
    const track = buildAnnotationTrack(dataset);

    expect(track.adapter).toMatchObject({
      type: "Gff3TabixAdapter",
      gffGzLocation: { uri: dataset.gffUrl },
      index: {
        indexType: "TBI",
        location: { uri: dataset.gffIndexUrl },
      },
    });
  });

  it("respects an explicit CSI index", () => {
    const track = buildAnnotationTrack({ ...dataset, gffIndexType: "CSI" });
    expect(track.adapter.index.indexType).toBe("CSI");
  });

  it("opens reference and annotation tracks at the configured initial location", () => {
    const session = buildInitialSession(dataset);
    expect(session.view.init).toMatchObject({
      assembly: dataset.accession,
      loc: dataset.initialLocation,
      tracks: ["MGYG000490722-reference", "MGYG000490722-annotations"],
    });
  });
});
