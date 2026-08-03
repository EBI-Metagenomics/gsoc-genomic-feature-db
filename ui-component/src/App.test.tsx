import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import App, { AccessionSelector } from "./App";
import { DEMO_ACCESSIONS, DEMO_DATASETS } from "./demo/datasets";

vi.mock("./component/GenomicFeatureBrowser", () => ({
  default: ({ dataset }: { dataset: { accession: string } }) => (
    <output data-testid="active-accession">{dataset.accession}</output>
  ),
}));

describe("demo application", () => {
  it("hides the accession selector when only one dataset is registered", () => {
    render(<App />);

    expect(screen.queryByRole("combobox", { name: "Genome accession" })).toBeNull();
    expect(screen.getByTestId("active-accession").textContent).toBe("MGYG000490722");
  });

  it("renders the accession selector when multiple datasets are registered", () => {
    const onChange = vi.fn();
    render(
      <AccessionSelector
        accessions={["MGYG000490722", "MGYG000490723"]}
        value="MGYG000490722"
        onChange={onChange}
      />,
    );

    const selector = screen.getByRole("combobox", { name: "Genome accession" });
    expect(selector.getAttribute("id")).toBe("demo-accession");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.getByRole("option", { name: "MGYG000490722" })).toBeTruthy();

    fireEvent.change(selector, { target: { value: "MGYG000490723" } });
    expect(onChange).toHaveBeenCalledWith("MGYG000490723");
  });

  it("defines one complete five-file runtime bundle", () => {
    expect(DEMO_ACCESSIONS).toEqual(["MGYG000490722"]);
    expect(DEMO_DATASETS.MGYG000490722).toMatchObject({
      accession: "MGYG000490722",
      databaseUrl: "/MGYG000490722/MGYG000490722.db.zip",
      fastaUrl: "/MGYG000490722/MGYG000490722.fna",
      fastaIndexUrl: "/MGYG000490722/MGYG000490722.fna.fai",
      gffUrl: "/MGYG000490722/MGYG000490722.gff.gz",
      gffIndexUrl: "/MGYG000490722/MGYG000490722.gff.gz.tbi",
    });
  });
});
