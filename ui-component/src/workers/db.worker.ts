// db.worker.ts — Web Worker that owns the SQLite WASM instance. Comlink exposes
// typed async methods to the main thread instead of raw postMessage / onmessage.

import * as Comlink from "comlink";
import { initSyncSQLite, createHttpBackend } from "sqlite-wasm-http";
import { SEARCH_PAGE_SIZE, HTTP_MAX_PAGE_SIZE, HTTP_CACHE_SIZE } from "../config";
import { buildMatchExpression } from "./fts";

// ---------------------------------------------------------------------------
// Types shared with the main thread
// ---------------------------------------------------------------------------

export interface GenomicFeature {
  id: number;
  feature_id: string;
  name: string;
  feature_type: string;
  seqid: string;
  start: number;
  end: number;
  strand: string;
  biotype: string;
  description: string;
  functional_summary: string;
}

export interface SearchPageResult {
  features: GenomicFeature[];
  elapsed_ms: number;
  next_cursor: number | null;
  has_more: boolean;
}

export interface SequenceRegion {
  seqid: string;
  start: number;
  end: number;
}

// ---------------------------------------------------------------------------
// Worker-internal state
// ---------------------------------------------------------------------------

let db: any = null; // oo1 (OO API #1) database handle
let sqlite3: any = null;
let httpBackend: any = null;

// ---------------------------------------------------------------------------
// Shared query execution
// ---------------------------------------------------------------------------

// Runs one rowid-ordered page for production callers.
function execSearch(query: string, column?: string, afterRowid?: number): SearchPageResult {
  if (!db) throw new Error("Database not initialised");

  const t0 = performance.now();

  // Sanitise + build the FTS5 MATCH expression (see workers/fts.ts). null means
  // the input has nothing usable (too short, or sanitises to empty).
  const matchExpr = buildMatchExpression(query, column);
  if (matchExpr === null) {
    return { features: [], elapsed_ms: 0, next_cursor: null, has_more: false };
  }

  console.log(`[db.worker] search("${query}", column=${column ?? "all"}) → MATCH: ${matchExpr}`);

  const hasCursor = afterRowid !== undefined;
  const sql = `
  SELECT m.rowid AS id, m.feature_id, m.name, m.feature_type,
         m.seqid, m.start, m.end, m.strand, m.biotype,
         m.description, m.functional_summary
  FROM search_fts AS f
  JOIN feature_meta AS m ON m.rowid = f.rowid
  WHERE search_fts MATCH ?
  ${hasCursor ? "AND f.rowid > ?" : ""}
  ORDER BY f.rowid
  LIMIT ?;
  `;

  const bindings = hasCursor
    ? [matchExpr, afterRowid, SEARCH_PAGE_SIZE]
    : [matchExpr, SEARCH_PAGE_SIZE];
  const rows = db.selectObjects(sql, bindings) as GenomicFeature[];
  const elapsed_ms = performance.now() - t0;
  console.log(`[db.worker] search found ${rows.length} results in ${elapsed_ms.toFixed(1)} ms`);
  return {
    features: rows,
    elapsed_ms,
    next_cursor: rows.length > 0 ? Number(rows[rows.length - 1].id) : null,
    has_more: rows.length === SEARCH_PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Public API (exposed via Comlink)
// ---------------------------------------------------------------------------

const workerApi = {
  /**
   * Legacy method for array buffer initialization (disabled in VFS mode).
   */
  async init(arrayBuffer: ArrayBuffer): Promise<string> {
    throw new Error("init(ArrayBuffer) is disabled in on-demand VFS mode. Use initFromUrl(url) instead.");
  },

  /**
   * Full-text search against the FTS5 table.
   * Returns one page of matching features ordered by FTS rowid.
   *
   * @param query  Raw user input.
   * @param column Optional FTS column to restrict the match to. When omitted (or
   *               not in FTS_COLUMNS) the query matches across all columns.
   */
  searchPage(query: string, column?: string, afterRowid?: number): SearchPageResult {
    return execSearch(query, column, afterRowid);
  },

  /**
   * Retrieve all distinct feature types present in the database
   * (useful for building filter UI later).
   */
  getFeatureTypes(): string[] {
    if (!db) throw new Error("Database not initialised");
    const types: string[] = [];
    db.exec({
      sql: "SELECT DISTINCT feature_type FROM feature_meta ORDER BY feature_type",
      rowMode: "array",
      callback: (row: string[]) => types.push(row[0]),
    });
    return types;
  },

  /**
   * Initialise the database on-demand using HTTP VFS.
   * This uses HTTP Range requests to stream database blocks on-demand.
   */
  async initFromUrl(url: string): Promise<string> {
    console.log(`initFromUrl("${url}") — starting HTTP VFS initialization...`);
    const t0 = performance.now();

    try {
      // 1. Create the HTTP backend for remote database access
      httpBackend = createHttpBackend({
        maxPageSize: HTTP_MAX_PAGE_SIZE,
        cacheSize: HTTP_CACHE_SIZE,
        backendType: "sync",
      });

      console.log(`[db.worker] HTTP VFS backend created (type: ${httpBackend.type})`);

      // 2. Initialize synchronous SQLite w/ the HTTP backend
      sqlite3 = await initSyncSQLite({ http: httpBackend });
      console.log(`[db.worker] SQLite VFS initialized in ${(performance.now() - t0).toFixed(1)} ms`);

      const oo = sqlite3.oo1;

      // 3. Open the database using HTTP VFS
      db = new oo.DB({
        filename: "file:" + encodeURI(url),
        vfs: "http",
      });

      console.log(`[db.worker] Database opened via HTTP VFS in ${(performance.now() - t0).toFixed(1)} ms`);

      // 4. Quick sanity check: retrieve the highest rowid from feature_meta.
      // This is an O(1) operation that avoids a full-table scan (SELECT count(*)) and prevents extra HTTP VFS range requests.
      const count = db.selectValue("SELECT max(rowid) FROM feature_meta") || 0;
      console.log(`[db.worker] Database ready — ~${count} features indexed`);

      return `Database loaded via on-demand HTTP VFS (type: ${httpBackend.type}) – ~${count} features indexed.`;
    } catch (err: any) {
      console.error(`[db.worker] Failed to initialize HTTP VFS:`, err);
      throw err;
    }
  },
};

export type WorkerApi = typeof workerApi;

Comlink.expose(workerApi);
