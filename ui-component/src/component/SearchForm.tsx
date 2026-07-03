// SearchForm.tsx — the search row: column-scope select + debounced input + submit.
// Stateless: SearchBar owns the query/column state and the debounce timer; this
// component just renders the controls and forwards events.

import { SEARCHABLE_COLUMNS, CONTROL_HEIGHT, SELECT_MIN_WIDTH } from "../config";

interface SearchFormProps {
  query: string;
  column: string;
  loading: boolean;
  searching: boolean;
  onQueryChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onColumnChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export default function SearchForm({
  query,
  column,
  loading,
  searching,
  onQueryChange,
  onColumnChange,
  onSubmit,
}: SearchFormProps) {
  return (
    // Search form: live-search on type + explicit vf-button submit (Enter/click)
    <form
      className="vf-form"
      role="search"
      onSubmit={onSubmit}
      style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
    >
      {/* Column scope: leverages the FTS5 detail=column index for per-field search */}
      <div className="vf-form__item" style={{ marginBottom: 0 }}>
        <label className="vf-form__label vf-u-sr-only" htmlFor="search-column">
          Search in field
        </label>
        <select
          id="search-column"
          className="vf-form__select"
          value={column}
          onChange={onColumnChange}
          disabled={loading}
          style={{
            minWidth: SELECT_MIN_WIDTH,
            height: CONTROL_HEIGHT,
            boxSizing: "border-box",
          }}
        >
          {SEARCHABLE_COLUMNS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="vf-form__item" style={{ position: "relative", flex: 1, marginBottom: 0 }}>
        <label className="vf-form__label vf-u-sr-only" htmlFor="genomic-search">
          Search genomic features
        </label>
        <input
          id="genomic-search"
          type="search"
          className="vf-form__input"
          placeholder={
            loading
              ? "Loading database…"
              : "Search genes, transcripts, exons… (e.g. WASH7P, OR4F)"
          }
          value={query}
          onChange={onQueryChange}
          disabled={loading}
          autoFocus
          style={{ height: CONTROL_HEIGHT, boxSizing: "border-box" }}
        />
        {searching && <span className="cvf-search-spinner" />}
      </div>
      <button
        type="submit"
        className="vf-button vf-button--primary"
        disabled={loading}
        style={{ height: CONTROL_HEIGHT, whiteSpace: "nowrap" }}
      >
        <span className="icon icon-functional" data-icon="1" aria-hidden="true" /> Search
      </button>
    </form>
  );
}
