import type { GenomicDataset } from "../types";

function uriLocation(uri: string) {
  return { uri, locationType: "UriLocation" as const };
}

function referenceTrackId(accession: string): string {
  return `${accession}-reference`;
}

function annotationTrackId(accession: string): string {
  return `${accession}-annotations`;
}

/** Build the IndexedFastaAdapter assembly for one host-resolved dataset. */
export function buildAssembly(dataset: GenomicDataset) {
  return {
    name: dataset.accession,
    sequence: {
      type: "ReferenceSequenceTrack" as const,
      trackId: referenceTrackId(dataset.accession),
      adapter: {
        type: "IndexedFastaAdapter" as const,
        fastaLocation: uriLocation(dataset.fastaUrl),
        faiLocation: uriLocation(dataset.fastaIndexUrl),
      },
    },
  };
}

/** Build the visible GFF3 tabix feature track for one dataset. */
export function buildAnnotationTrack(dataset: GenomicDataset) {
  return {
    type: "FeatureTrack" as const,
    trackId: annotationTrackId(dataset.accession),
    name: `${dataset.accession} annotations`,
    assemblyNames: [dataset.accession],
    category: ["Annotations"],
    adapter: {
      type: "Gff3TabixAdapter" as const,
      gffGzLocation: uriLocation(dataset.gffUrl),
      index: {
        indexType: dataset.gffIndexType ?? "TBI",
        location: uriLocation(dataset.gffIndexUrl),
      },
    },
  };
}

/** Build the initial single-view session with reference and annotations visible. */
export function buildInitialSession(dataset: GenomicDataset) {
  const location = dataset.initialLocation ? { loc: dataset.initialLocation } : {};
  return {
    name: `${dataset.accession} session`,
    view: {
      id: `${dataset.accession}-linear-view`,
      type: "LinearGenomeView" as const,
      init: {
        assembly: dataset.accession,
        tracks: [referenceTrackId(dataset.accession), annotationTrackId(dataset.accession)],
        ...location,
      },
    },
  };
}

/** Build the complete immutable input passed once to `useCreateViewState`. */
export function buildViewStateConfig(dataset: GenomicDataset) {
  return {
    assembly: buildAssembly(dataset),
    tracks: [buildAnnotationTrack(dataset)],
    defaultSession: buildInitialSession(dataset),
  };
}
