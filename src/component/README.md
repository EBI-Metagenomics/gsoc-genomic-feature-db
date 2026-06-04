# `SearchBar.tsx` Component

The `SearchBar.tsx` is the primary user interface component for the Genomic Feature Search POC. It provides a highly responsive, debounced search experience and visually displays genomic data queried from a local-first SQLite database.

## Functionality Overview

### 1. User Interface & Search Input
- **Debounced Querying**: To prevent UI locking and unnecessary database queries, user input is debounced by 200ms. Searches are only triggered when the user types 3 or more characters.
- **Dynamic Feedback**: Displays loading spinners, query execution time (in ms), result counts, and handles error states seamlessly.
- **Result Visualization**: Renders an interactive table displaying the `Name`, `Type`, `Position`, `Strand`, `Biotype`, and `Description`.
- **Annotation Parsing**: Key-value pairs stored in the `annotations` field are parsed and rendered as highly readable, inline code badges.
- **Color-Coded Badges**: Genomic feature types (e.g., `gene`, `mRNA`, `exon`, `CDS`) are given distinct colors to allow for quick visual scanning.

### 2. Architecture & Data Flow
The `SearchBar` component sits at the top of the frontend architecture but relies on a deep, high-performance pipeline:

1. **The Hook (`useDbSearch.ts`)**: 
   - `SearchBar` receives its state (`results`, `loading`, `searching`) and the `search` callback from the `useDbSearch` React hook. 
   - This hook is responsible for managing the lifecycle of the Web Worker.

2. **The Web Worker (`db.worker.ts`)**:
   - Uses `sqlite-wasm-http` to load the SQLite database via **HTTP VFS (Virtual File System)**. This allows the database to be queried via HTTP Range requests without downloading the entire file to the client's memory.
   - When `SearchBar` triggers a search, the worker sanitizes the query and executes an `FTS5` (Full-Text Search) `MATCH` query against the `search_index` virtual table.
   - It returns the results ordered by rank (relevance) back to the UI thread.

3. **The Indexer (`indexer.py`)**:
   - The data displayed in `SearchBar` is pre-processed by `scripts/indexer.py`.
   - The script parses massive `.gff.gz` genomic files and extracts essential columns (`seqid`, `start`, `end`, `strand`, `type`, `attributes`).
   - It builds the compact SQLite database (`genomics.db.zip`) with an `FTS5` table optimized for prefix and boolean searching, which `db.worker.ts` eventually queries.

## Props
```typescript
interface SearchBarProps {
  results: GenomicFeature[];         // Array of matched genomic features
  loading: boolean;                  // True if the SQLite DB is still initializing
  searching: boolean;                // True if an active search query is in-flight
  status: string;                    // Status message (e.g., "Connecting to database…")
  error: string | null;              // Error message, if any
  elapsed: number;                   // Execution time of the last query in ms
  search: (query: string) => Promise<void>; // The search trigger function
}
```
