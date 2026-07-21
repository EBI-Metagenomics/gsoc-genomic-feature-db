import SearchBar from "./component/SearchBar";
import { useDbSearch } from "./hooks/useDbSearch";

export default function App() {
  const {
    results,
    loading,
    searching,
    loadingMore,
    hasMore,
    error,
    elapsed,
    search,
    loadMore,
  } = useDbSearch();

  return (
    <main className="vf-stack vf-stack--400" style={{ width: "85%", maxWidth: "100rem", boxSizing: "border-box", margin: "0 auto", padding: "2rem 1rem" }}>
      <section style={{ width: "100%", textAlign: "center" }}>
        <h1 className="vf-intro__heading">Genomic Feature Search</h1>
      </section>
      {error && (
        <div role="alert" className="vf-banner vf-banner--alert vf-banner--danger">
          <div className="vf-banner__content">
            <p className="vf-banner__text">
              <strong>Error:</strong> {error}
            </p>
          </div>
        </div>
      )}
      <SearchBar
        results={results}
        loading={loading}
        searching={searching}
        loadingMore={loadingMore}
        hasMore={hasMore}
        elapsed={elapsed}
        search={search}
        loadMore={loadMore}
      />
    </main>
  );
}
