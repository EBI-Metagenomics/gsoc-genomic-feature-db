import { useCallback, useState } from "react";

import SearchBar from "./SearchBar";
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
  const searchState = useDbSearch(dataset.databaseUrl);
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
      {searchState.loading && <p role="status">{searchState.status}</p>}
      {searchState.error && (
        <div role="alert" className="vf-banner vf-banner--alert vf-banner--danger">
          <div className="vf-banner__content">
            <p className="vf-banner__text">
              <strong>Search error:</strong> {searchState.error}
            </p>
          </div>
        </div>
      )}
      <SearchBar
        {...searchState}
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
