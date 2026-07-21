// SearchForm.tsx — the search row: debounced input + submit.
// Stateless: SearchBar owns the query state and the debounce timer; this
// component just renders the controls and forwards events.

interface SearchFormProps {
  query: string;
  loading: boolean;
  searching: boolean;
  onQueryChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export default function SearchForm({
  query,
  loading,
  searching,
  onQueryChange,
  onSubmit,
}: SearchFormProps) {
  return (
    // Official responsive VF search structure; application logic remains React-owned.
    <form
      className="vf-form vf-form--search vf-form--search--responsive | vf-sidebar vf-sidebar--end"
      role="search"
      onSubmit={onSubmit}
    >
      <div className="vf-sidebar__inner">
        <div className="vf-form__item" style={{ position: "relative" }}>
          <label
            className="vf-form__label vf-u-sr-only | vf-search__label"
            htmlFor="genomic-search"
          >
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
          />
          {searching && <span className="cvf-search-spinner" />}
        </div>
        <button
          type="submit"
          className="vf-search__button | vf-button vf-button--primary"
          disabled={loading}
        >
          <span className="vf-button__text">Search</span>
          <svg
            className="vf-icon vf-icon--search-btn | vf-button__icon"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
          >
            <path d="M23.414 20.591l-4.645-4.645a10.256 10.256 0 1 0-2.828 2.829l4.645 4.644a2.025 2.025 0 0 0 2.828 0 2 2 0 0 0 0-2.828ZM10.25 3.005A7.25 7.25 0 1 1 3 10.255a7.258 7.258 0 0 1 7.25-7.25Z" />
          </svg>
        </button>
      </div>
    </form>
  );
}
