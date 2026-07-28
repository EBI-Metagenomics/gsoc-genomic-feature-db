import { JBrowseLinearGenomeView, useCreateViewState } from "@jbrowse/react-linear-genome-view2";
import { reaction } from "mobx";
import { useEffect, useRef, useState } from "react";

import type { GenomicDataset, GenomicFeature } from "../types";
import { buildViewStateConfig } from "./config";
import JBrowseErrorBoundary from "./JBrowseErrorBoundary";
import { featureToLocation } from "./navigation";

interface GenomicLinearViewProps {
  dataset: GenomicDataset;
  maxHeight?: number;
  selectedFeature?: GenomicFeature | null;
  navigationFlankBp?: number;
  onError?: (error: Error) => void;
}

function GenomicLinearViewInstance({
  dataset,
  maxHeight,
  selectedFeature,
  navigationFlankBp,
  onError,
}: GenomicLinearViewProps) {
  const viewState = useCreateViewState(buildViewStateConfig(dataset));
  const pendingFeatureRef = useRef(selectedFeature);
  const [navigationError, setNavigationError] = useState<{
    featureId: number;
    message: string;
  } | null>(null);
  const [navigatedLocation, setNavigatedLocation] = useState<{
    featureId: number;
    location: string;
  } | null>(null);

  useEffect(() => {
    pendingFeatureRef.current = selectedFeature;
  }, [selectedFeature]);

  useEffect(() => {
    if (!selectedFeature) return;
    let active = true;

    const dispose = reaction(
      () => viewState.session.view.initialized,
      (initialized) => {
        const pendingFeature = pendingFeatureRef.current;
        if (!initialized || !pendingFeature) return;
        const location = featureToLocation(pendingFeature, navigationFlankBp);
        void viewState.session.view
          .navToLocString(location, dataset.accession)
          .then(() => {
            if (active) {
              setNavigatedLocation({ featureId: pendingFeature.id, location });
            }
          })
          .catch((caught: unknown) => {
            if (!active) return;
            const error = caught instanceof Error ? caught : new Error(String(caught));
            setNavigationError({
              featureId: pendingFeature.id,
              message: error.message,
            });
            onError?.(error);
          });
      },
      { fireImmediately: true },
    );
    return () => {
      active = false;
      dispose();
    };
  }, [dataset.accession, navigationFlankBp, onError, selectedFeature, viewState]);

  const visibleLocation =
    navigatedLocation && navigatedLocation.featureId === selectedFeature?.id
      ? navigatedLocation.location
      : undefined;

  return (
    <div
      className="cvf-jbrowse"
      style={{ maxHeight }}
      data-accession={dataset.accession}
      data-visible-location={visibleLocation}
    >
      {navigationError && navigationError.featureId === selectedFeature?.id && (
        <div className="cvf-jbrowse__error" role="alert">
          Could not navigate the genome browser: {navigationError.message}
        </div>
      )}
      <JBrowseErrorBoundary resetKey={dataset.accession} onError={onError}>
        <JBrowseLinearGenomeView viewState={viewState} />
      </JBrowseErrorBoundary>
    </div>
  );
}

/**
 * Render one embedded JBrowse linear view from host-provided asset URLs.
 *
 * The keyed inner component recreates view state only when the accession changes.
 */
export default function GenomicLinearView(props: GenomicLinearViewProps) {
  return <GenomicLinearViewInstance key={props.dataset.accession} {...props} />;
}
