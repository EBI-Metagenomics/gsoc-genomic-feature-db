// AnnotationBadges.tsx — compact, fixed-width annotation rendering for the results
// table's "Annotations" column.
//
// Each source collapses to a single colour-coded letter badge (P=Pfam, I=InterPro,
// K=KEGG, …); clicking one opens a popover listing every value, and a legend above
// the table decodes the letters. This keeps the column a constant width no matter
// how many annotations a feature carries. Source data lives in annotations/sources,
// the functional_summary parser in annotations/parse.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { POPOVER_WIDTH, POPOVER_GAP, VIEWPORT_PAD } from "../config";
import type { GenomicFeature } from "../hooks/useDbSearch";
import { SOURCES } from "./annotations/sources";
import { parseAnnotations, type ParsedSource } from "./annotations/parse";

// Re-export so consumers (SearchBar, ResultsTable) import the badge API from one place.
export type { ParsedSource } from "./annotations/parse";

// --------------------------------------------------------------------------
// Popover state — lifted so only one popover is ever open
// --------------------------------------------------------------------------

export interface PopoverState {
  key: string; // `${rowId}:${sourceKey}` of the open badge
  rect: DOMRect; // anchor badge position (viewport coords)
  source: ParsedSource;
}

// Hook owning the single open-popover slot plus a toggle handler for badges.
export function useAnnotationPopover() {
  const [popover, setPopover] = useState<PopoverState | null>(null);

  const toggle = useCallback((key: string, source: ParsedSource, el: HTMLElement) => {
    setPopover((cur) =>
      cur && cur.key === key ? null : { key, source, rect: el.getBoundingClientRect() }
    );
  }, []);

  const close = useCallback(() => setPopover(null), []);

  return { popover, toggle, close };
}

// --------------------------------------------------------------------------
// Components
// --------------------------------------------------------------------------

interface AnnotationCellProps {
  summary: string | null | undefined;
  rowId: number;
  openKey: string | null;
  onToggle: (key: string, source: ParsedSource, el: HTMLElement) => void;
}

// Row cell: a fixed-width strip of letter badges (or a muted dash).
export function AnnotationCell({ summary, rowId, openKey, onToggle }: AnnotationCellProps) {
  const sources = useMemo(() => parseAnnotations(summary), [summary]);

  if (sources.length === 0) {
    return <span className="cvf-annotation-empty">—</span>;
  }

  return (
    <div className="cvf-annotation-badges">
      {sources.map((s) => {
        const key = `${rowId}:${s.meta.key}`;
        const count = s.values.length;
        return (
          <button
            key={s.meta.key}
            type="button"
            data-annotation-badge=""
            className="cvf-annotation-badge"
            aria-haspopup="dialog"
            aria-expanded={openKey === key}
            aria-label={`${s.meta.label}: ${count} value${count !== 1 ? "s" : ""}`}
            title={s.meta.label}
            style={{ color: s.meta.color, backgroundColor: s.meta.bg, borderColor: s.meta.color }}
            onClick={(e) => onToggle(key, s, e.currentTarget)}
          >
            {s.meta.letter}
          </button>
        );
      })}
    </div>
  );
}

// The single, portal-rendered popover. Portaling to <body> with fixed positioning
// escapes the results wrapper's overflow:auto clipping. Closes on Esc, outside
// click, outside scroll, or resize (a fixed popover can't track a scrolled
// anchor); scrolling the popover's own overflowing list keeps it open.
export function AnnotationPopover({
  state,
  onClose,
}: {
  state: PopoverState | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t)) return; // click inside popover
      if (t.closest("[data-annotation-badge]")) return; // badge handles its own toggle
      onClose();
    };
    // Close when the page/results wrapper scrolls (a fixed popover can't track a
    // moved anchor) — but NOT when the user scrolls the popover's own overflowing
    // list (e.g. a long KEGG value set), which also fires here in capture phase.
    const onScroll = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };

    // Capture-phase scroll catches the results wrapper scrolling, not just window.
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [state, onClose]);

  if (!state) return null;

  const { rect, source } = state;
  // Anchor below the badge, clamped into the viewport on both axes.
  const top = rect.bottom + POPOVER_GAP;
  const left = Math.max(
    VIEWPORT_PAD,
    Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - VIEWPORT_PAD)
  );

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`${source.meta.label} annotations`}
      className="cvf-annotation-popover"
      style={{ top, left, width: POPOVER_WIDTH }}
    >
      <div className="cvf-annotation-popover-title" style={{ color: source.meta.color }}>
        {source.meta.label}
      </div>
      {source.meta.key === "other" ? (
        source.tagGroups.map((g) => (
          <div key={g.tag} className="cvf-annotation-group">
            <div className="cvf-annotation-group-tag">{g.tag}</div>
            <ul className="cvf-annotation-list">
              {g.values.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
          </div>
        ))
      ) : (
        <ul className="cvf-annotation-list">
          {source.values.map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
      )}
    </div>,
    document.body
  );
}

// One-line legend: only the sources actually present in the current results.
export function AnnotationLegend({ results }: { results: GenomicFeature[] }) {
  const present = useMemo(() => {
    const keys = new Set<string>();
    for (const f of results) {
      for (const s of parseAnnotations(f.functional_summary)) keys.add(s.meta.key);
    }
    return SOURCES.filter((s) => keys.has(s.key));
  }, [results]);

  if (present.length === 0) return null;

  return (
    <div className="cvf-annotation-legend">
      <span className="cvf-annotation-legend-title">Annotations:</span>
      {present.map((s) => (
        <span key={s.key} className="cvf-annotation-legend-item">
          <span
            className="cvf-annotation-badge cvf-annotation-badge--static"
            aria-hidden="true"
            style={{ color: s.color, backgroundColor: s.bg, borderColor: s.color }}
          >
            {s.letter}
          </span>
          {s.label}
        </span>
      ))}
    </div>
  );
}
