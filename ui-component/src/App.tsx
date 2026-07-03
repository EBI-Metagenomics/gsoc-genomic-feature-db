import SearchBar from "./component/SearchBar";
import { useDbSearch } from "./hooks/useDbSearch";

export default function App() {
  const {
    results,
    loading,
    searching,
    status,
    error,
    elapsed,
    search,
  } = useDbSearch();

  return (
    <main className="vf-stack vf-stack--400" style={{ maxWidth: '80rem', margin: '0 auto', padding: '2rem 1rem' }}>
      <section className="vf-intro">
        <h1 className="vf-intro__heading">Genomic Feature Search</h1>
        <p className="vf-intro__text">
          {loading ? "⏳ " : "✅ "}{status}
        </p>
      </section>
      <SearchBar
        results={results}
        loading={loading}
        searching={searching}
        status={status}
        error={error}
        elapsed={elapsed}
        search={search}
      />
    </main>
  );
}