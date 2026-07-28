// ResultsTable.tsx — renders the matched features as a sticky-header table, with
// the Annotations column delegated to AnnotationCell.

import { RESULT_TABLE_HEADINGS, FEATURE_TYPE_BADGE_CLASS, DEFAULT_BADGE_CLASS } from "../config";
import type { GenomicFeature } from "../types";
import { AnnotationCell, type ParsedSource } from "./AnnotationBadges";

// feature_type → EBI Visual Framework badge class (falls back to the base badge).
function badgeClassFor(type: string): string {
  return FEATURE_TYPE_BADGE_CLASS[type] ?? DEFAULT_BADGE_CLASS;
}

interface ResultsTableProps {
  results: GenomicFeature[];
  selectedFeature: GenomicFeature | null;
  onSelectFeature: (feature: GenomicFeature) => void;
  openKey: string | null;
  onToggleAnnotation: (key: string, source: ParsedSource, el: HTMLElement) => void;
}

export default function ResultsTable({
  results,
  selectedFeature,
  onSelectFeature,
  openKey,
  onToggleAnnotation,
}: ResultsTableProps) {
  return (
    <div className="cvf-results-wrapper">
      <table className="vf-table vf-table--striped">
        <thead>
          <tr>
            {RESULT_TABLE_HEADINGS.map((heading) => (
              <th key={heading} className="vf-table__heading">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((f) => (
            <tr
              key={f.id}
              className={selectedFeature?.id === f.id ? "cvf-result--selected" : undefined}
            >
              <td className="vf-table__cell">
                {/* Stable identifier as the anchor; gene symbol as a muted subtitle
                    when it adds something beyond the id (matches the domain's
                    Locus-Tag-then-Gene convention). */}
                <button
                  type="button"
                  className="vf-button vf-button--link cvf-feature-link"
                  aria-current={selectedFeature?.id === f.id ? "location" : undefined}
                  onClick={() => onSelectFeature(f)}
                >
                  {f.feature_id}
                </button>
                {f.name && f.name !== f.feature_id && (
                  <div className="cvf-feature-gene">{f.name}</div>
                )}
              </td>
              <td className="vf-table__cell">
                <span className={badgeClassFor(f.feature_type)}>{f.feature_type}</span>
              </td>
              <td
                className="vf-table__cell"
                style={{ fontFamily: "monospace", fontSize: "0.875rem" }}
              >
                {f.seqid}:{f.start.toLocaleString()}-{f.end.toLocaleString()}
              </td>
              <td className="vf-table__cell" style={{ textAlign: "center" }}>
                {f.strand}
              </td>
              <td className="vf-table__cell">
                {/* Often empty for prokaryotic data — show a muted dash, not a blank. */}
                {f.biotype || <span className="cvf-empty">—</span>}
              </td>
              <td className="vf-table__cell">{f.description}</td>
              <td className="vf-table__cell">
                <AnnotationCell
                  summary={f.functional_summary}
                  rowId={f.id}
                  openKey={openKey}
                  onToggle={onToggleAnnotation}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
