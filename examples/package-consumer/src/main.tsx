import React from "react";
import ReactDOM from "react-dom/client";
import {
  GenomicFeatureBrowser,
  type GenomicDataset,
  type GenomicFeature,
} from "genomic-feature-db-component";
import "./host.css";
import "genomic-feature-db-component/styles.css";

const accession = "MGYG000490722";
const dataset: GenomicDataset = {
  accession,
  databaseUrl: `/${accession}/${accession}.db.zip`,
  databaseSizeBytes: 18_558_976,
  databaseSha256:
    "6f486bd3ebcad27a4f1e7968fc06fafac349ed21889058ff9e72e2b67ce26e28",
  fastaUrl: `/${accession}/${accession}.fna`,
  fastaIndexUrl: `/${accession}/${accession}.fna.fai`,
  gffUrl: `/${accession}/${accession}.gff.gz`,
  gffIndexUrl: `/${accession}/${accession}.gff.gz.tbi`,
  initialLocation: `${accession}_1:1..5000`,
};

function Consumer() {
  const [selected, setSelected] = React.useState<GenomicFeature | null>(null);
  return (
    <main className="package-consumer">
      <h1>Tarball package consumer</h1>
      <output data-testid="host-selected-feature">
        {selected?.feature_id ?? "none"}
      </output>
      <GenomicFeatureBrowser dataset={dataset} onFeatureSelect={setSelected} />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Consumer />
  </React.StrictMode>,
);
