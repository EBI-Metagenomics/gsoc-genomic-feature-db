import { useMemo } from "react";
import type { GenomicFeature } from "../types";

const UNSPECIFIED = "Unspecified";

export default function FeatureTypeFacets({ results }: { results: GenomicFeature[] }) {
  const counts = useMemo(() => {
    const byType = new Map<string, number>();
    for (const feature of results) {
      const type = feature.feature_type?.trim() || UNSPECIFIED;
      byType.set(type, (byType.get(type) ?? 0) + 1);
    }

    return Array.from(byType, ([type, count]) => ({ type, count })).sort(
      (a, b) => b.count - a.count || a.type.localeCompare(b.type),
    );
  }, [results]);

  if (results.length === 0) return null;

  return (
    <section aria-label={`Feature types in loaded results (${results.length})`}>
      <div className="cvf-annotation-legend" style={{ flexWrap: "wrap" }}>
        <span className="cvf-annotation-legend-title">
          Feature types in loaded results ({results.length})
        </span>
        {counts.map(({ type, count }) => (
          <span
            key={type}
            className="vf-badge"
            aria-label={`${type}: ${count} loaded feature${count !== 1 ? "s" : ""}`}
          >
            {type} {count}
          </span>
        ))}
      </div>
    </section>
  );
}
