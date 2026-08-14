import type { GenomicDataset, GenomicFeature } from "../types";
import GenomicLinearView from "../jbrowse/GenomicLinearView";

/** Private domain boundary between the composed browser and its JBrowse implementation. */
export interface GenomeViewProps {
  dataset: GenomicDataset;
  selectedFeature: GenomicFeature | null;
  maxHeight?: number;
  navigationFlankBp?: number;
}

export default function GenomeView(props: GenomeViewProps) {
  return <GenomicLinearView {...props} />;
}
