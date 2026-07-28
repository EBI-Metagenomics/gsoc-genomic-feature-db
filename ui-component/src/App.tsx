import { useState } from "react";

import { DEMO_ACCESSIONS, DEMO_DATASETS } from "./demo/datasets";
import GenomicFeatureBrowser from "./component/GenomicFeatureBrowser";

interface AccessionSelectorProps {
  accessions: string[];
  value: string;
  onChange: (accession: string) => void;
}

export function AccessionSelector({ accessions, value, onChange }: AccessionSelectorProps) {
  if (accessions.length <= 1) return null;

  return (
    <div className="vf-form__item">
      <label className="vf-form__label" htmlFor="demo-accession">
        Genome accession
      </label>
      <select
        className="vf-form__select cvf-demo-accession"
        id="demo-accession"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {accessions.map((accession) => (
          <option key={accession} value={accession}>
            {accession}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function App() {
  const [accession, setAccession] = useState(DEMO_ACCESSIONS[0]);
  const dataset = DEMO_DATASETS[accession];

  return (
    <main
      className="vf-stack vf-stack--400"
      style={{
        width: "85%",
        maxWidth: "100rem",
        boxSizing: "border-box",
        margin: "0 auto",
        padding: "2rem 1rem",
      }}
    >
      <section style={{ width: "100%", textAlign: "center" }}>
        <h1 className="vf-intro__heading">Genomic Feature Search</h1>
      </section>
      <AccessionSelector accessions={DEMO_ACCESSIONS} value={accession} onChange={setAccession} />
      <GenomicFeatureBrowser key={accession} dataset={dataset} />
    </main>
  );
}
