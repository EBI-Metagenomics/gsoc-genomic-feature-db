import { useCallback, useState } from "react";

import SearchBar from "./SearchBar";
import DatabaseStatus from "./DatabaseStatus";
import { useDbSearch } from "../hooks/useDbSearch";
import GenomicLinearView from "../jbrowse/GenomicLinearView";
import type { GenomicFeature, GenomicFeatureBrowserProps } from "../types";

function BrowserInstance({
  dataset,
  browserHeight = 450,
  navigationFlankBp = 1_000,
  className,
  onFeatureSelect,
}: GenomicFeatureBrowserProps) {
  const searchState = useDbSearch(dataset.databaseUrl, {
    expectedSizeBytes: dataset.databaseSizeBytes,
    sha256: dataset.databaseSha256,
  });
  const [selectedFeature, setSelectedFeature] = useState<GenomicFeature | null>(null);
  const selectFeature = useCallback(
    (feature: GenomicFeature) => {
      setSelectedFeature(feature);
      onFeatureSelect?.(feature);
    },
    [onFeatureSelect],
  );
  const classes = ["cvf-genomic-feature-browser", "vf-stack", "vf-stack--400"];
  if (className) classes.push(className);

  return (
    <section className={classes.join(" ")}>
      <DatabaseStatus {...searchState} expectedSizeBytes={dataset.databaseSizeBytes} />
      <SearchBar
        {...searchState}
        loading={!searchState.ready}
        selectedFeature={selectedFeature}
        onSelectFeature={selectFeature}
      />
      <GenomicLinearView
        dataset={dataset}
        maxHeight={browserHeight}
        selectedFeature={selectedFeature}
        navigationFlankBp={navigationFlankBp}
      />
    </section>
  );
}

/** Compose browser-local SQLite search with one embedded JBrowse linear view. */
export default function GenomicFeatureBrowser(props: GenomicFeatureBrowserProps) {
  const datasetKey = `${props.dataset.accession}:${props.dataset.databaseUrl}`;
  return <BrowserInstance key={datasetKey} {...props} />;
}
