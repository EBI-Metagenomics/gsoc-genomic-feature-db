import * as Comlink from "comlink";
import { createHttpBackend, initSyncSQLite } from "sqlite-wasm-http";

import { HTTP_CACHE_SIZE, HTTP_MAX_PAGE_SIZE, SEARCH_PAGE_SIZE } from "../config";
import type { GenomicFeature } from "../types";
import { buildMatchExpression } from "./fts";
import { boundSearchPage } from "./pagination";
import { readAndValidateSchemaMetadata } from "./schema";

/** One rowid-ordered page returned from the search index. */
export interface SearchPageResult {
  features: GenomicFeature[];
  elapsed_ms: number;
  next_cursor: number | null;
  has_more: boolean;
}

/** A reference sequence span stored in the feature database. */
export interface SequenceRegion {
  seqid: string;
  start: number;
  end: number;
}

type SqlBinding = string | number | undefined;

interface DatabaseHandle {
  selectObjects(sql: string, bindings: SqlBinding[]): unknown[];
  selectValue(sql: string): unknown;
  exec(options: { sql: string; rowMode: "array"; callback: (row: string[]) => void }): void;
}

interface SqliteModule {
  oo1: {
    DB: new (options: { filename: string; vfs: "http" }) => DatabaseHandle;
  };
}

let database: DatabaseHandle | null = null;
let httpBackend: ReturnType<typeof createHttpBackend> | null = null;

function requireDatabase(): DatabaseHandle {
  if (!database) {
    throw new Error("Database not initialised");
  }
  return database;
}

function execSearch(query: string, column?: string, afterRowid?: number): SearchPageResult {
  const db = requireDatabase();
  const startedAt = performance.now();
  const matchExpression = buildMatchExpression(query, column);
  if (matchExpression === null) {
    return {
      features: [],
      elapsed_ms: 0,
      next_cursor: null,
      has_more: false,
    };
  }

  const hasCursor = afterRowid !== undefined;
  const rows = db.selectObjects(
    `
      SELECT m.rowid AS id, m.feature_id, m.name, m.feature_type,
             m.seqid, m.start, m.end, m.strand, m.biotype,
             m.description, m.functional_summary
      FROM search_fts AS f
      JOIN feature_meta AS m ON m.rowid = f.rowid
      WHERE search_fts MATCH ?
      ${hasCursor ? "AND f.rowid > ?" : ""}
      ORDER BY f.rowid
      LIMIT ?;
    `,
    hasCursor
      ? [matchExpression, afterRowid, SEARCH_PAGE_SIZE + 1]
      : [matchExpression, SEARCH_PAGE_SIZE + 1],
  ) as GenomicFeature[];
  const page = boundSearchPage(rows, SEARCH_PAGE_SIZE);

  return {
    features: page.features,
    elapsed_ms: performance.now() - startedAt,
    next_cursor: page.nextCursor,
    has_more: page.hasMore,
  };
}

const workerApi = {
  async init(arrayBuffer: ArrayBuffer): Promise<never> {
    void arrayBuffer;
    throw new Error(
      "init(ArrayBuffer) is disabled in on-demand VFS mode. Use initFromUrl(url) instead.",
    );
  },

  searchPage(query: string, column?: string, afterRowid?: number): SearchPageResult {
    return execSearch(query, column, afterRowid);
  },

  getFeatureTypes(): string[] {
    const db = requireDatabase();
    const types: string[] = [];
    db.exec({
      sql: "SELECT DISTINCT feature_type FROM feature_meta ORDER BY feature_type",
      rowMode: "array",
      callback: (row) => types.push(row[0]),
    });
    return types;
  },

  async initFromUrl(url: string): Promise<string> {
    database = null;
    httpBackend = createHttpBackend({
      maxPageSize: HTTP_MAX_PAGE_SIZE,
      cacheSize: HTTP_CACHE_SIZE,
      backendType: "sync",
    });
    const sqlite = (await initSyncSQLite({
      http: httpBackend,
    })) as unknown as SqliteModule;
    const candidateDatabase = new sqlite.oo1.DB({
      filename: `file:${encodeURI(url)}`,
      vfs: "http",
    });
    const metadata = readAndValidateSchemaMetadata(candidateDatabase);
    database = candidateDatabase;
    const rowCount = Number(database.selectValue("SELECT max(rowid) FROM feature_meta")) || 0;

    return `Database loaded via on-demand HTTP VFS (type: ${httpBackend.type}) – schema v${metadata.schemaVersion}, generator v${metadata.generatorVersion}, ~${rowCount} features indexed.`;
  },
};

export type WorkerApi = typeof workerApi;

Comlink.expose(workerApi);
