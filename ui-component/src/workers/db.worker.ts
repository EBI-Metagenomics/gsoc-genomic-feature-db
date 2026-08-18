import * as Comlink from "comlink";
import { createHttpBackend, initSyncSQLite } from "sqlite-wasm-http";

import { HTTP_CACHE_SIZE, HTTP_MAX_PAGE_SIZE, SEARCH_PAGE_SIZE } from "../config";
import type { GenomicFeature } from "../types";
import { downloadCompleteDatabase } from "./databaseDownload";
import {
  createTransferCounters,
  diagnosticsFrom,
  type DatabaseIntegrity,
  type DatabaseLoadMode,
  type LoadingProgress,
  probeRangeSupport,
  snapshotCounters,
  type TransferCounters,
  type TransferDiagnostics,
} from "./databaseTransport";
import { buildMatchExpression } from "./fts";
import { boundSearchPage } from "./pagination";
import {
  deserializeDatabase,
  type DatabaseHandle,
  type SqliteModule,
  validateDatabase,
} from "./sqliteDatabase";
import { installVfsRequestGuard } from "./vfsRequestGuard";

export interface SearchPageResult {
  features: GenomicFeature[];
  elapsed_ms: number;
  next_cursor: number | null;
  has_more: boolean;
  diagnostics: TransferDiagnostics;
}

export interface SequenceRegion {
  seqid: string;
  start: number;
  end: number;
}

export interface DatabaseInitOptions extends DatabaseIntegrity {
  mode?: DatabaseLoadMode;
}

export interface DatabaseInitResult {
  message: string;
  diagnostics: TransferDiagnostics;
  elapsed_ms: number;
}

let database: DatabaseHandle | null = null;
let httpBackend: ReturnType<typeof createHttpBackend> | null = null;
let restoreXhrGuard: (() => void) | null = null;
let counters: TransferCounters = createTransferCounters();
let loadMode: DatabaseLoadMode = "range";
let databaseSizeBytes: number | null = null;
let pageSizeBytes: number | null = null;

function requireDatabase(): DatabaseHandle {
  if (!database) throw new Error("Database not initialised");
  return database;
}

function currentDiagnostics(before = snapshotCounters(counters)): TransferDiagnostics {
  return diagnosticsFrom(loadMode, counters, before, databaseSizeBytes, pageSizeBytes);
}

function execSearchOnce(query: string, afterRowid?: number) {
  const matchExpression = buildMatchExpression(query);
  if (matchExpression === null) {
    return { features: [], next_cursor: null, has_more: false };
  }
  const hasCursor = afterRowid !== undefined;
  const rows = requireDatabase().selectObjects(
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
    next_cursor: page.nextCursor,
    has_more: page.hasMore,
  };
}

function execSearch(query: string, afterRowid?: number): SearchPageResult {
  const before = snapshotCounters(counters);
  const startedAt = performance.now();
  let page;
  try {
    page = execSearchOnce(query, afterRowid);
  } catch (error: unknown) {
    if (counters.lastFailure !== "transient") throw error;
    counters.retries += 1;
    page = execSearchOnce(query, afterRowid);
  }
  return {
    ...page,
    elapsed_ms: performance.now() - startedAt,
    diagnostics: currentDiagnostics(before),
  };
}

function disposeDatabase(): void {
  database?.close();
  database = null;
  httpBackend?.terminate();
  httpBackend = null;
  restoreXhrGuard?.();
  restoreXhrGuard = null;
}

function readyResult(
  validated: ReturnType<typeof validateDatabase>,
  before: ReturnType<typeof snapshotCounters>,
): DatabaseInitResult {
  database = validated.database;
  const description =
    loadMode === "range"
      ? "Range loading active; the complete database was not downloaded"
      : "Complete database downloaded and verified";
  return {
    message: `${description} – schema v${validated.schemaVersion}, generator v${validated.generatorVersion}, ~${validated.rowCount} features indexed.`,
    diagnostics: currentDiagnostics(before),
    elapsed_ms: 0,
  };
}

async function initialiseRangeDatabase(
  url: string,
  integrity: DatabaseIntegrity,
  report?: (progress: LoadingProgress) => void,
): Promise<DatabaseInitResult> {
  const before = snapshotCounters(counters);
  const probe = await probeRangeSupport(url, integrity, counters, report);
  databaseSizeBytes = probe.databaseSizeBytes;
  pageSizeBytes = probe.pageSizeBytes;
  report?.({ mode: "range", phase: "opening", loadedBytes: 0, totalBytes: null, attempt: 1 });
  restoreXhrGuard = installVfsRequestGuard(counters, probe.databaseSizeBytes, probe.validator);
  httpBackend = createHttpBackend({
    maxPageSize: HTTP_MAX_PAGE_SIZE,
    cacheSize: HTTP_CACHE_SIZE,
    backendType: "sync",
  });
  const sqlite = (await initSyncSQLite({ http: httpBackend })) as unknown as SqliteModule;
  const candidate = new sqlite.oo1.DB({ filename: `file:${encodeURI(url)}`, vfs: "http" });
  try {
    return readyResult(validateDatabase(candidate, false), before);
  } catch (error: unknown) {
    candidate.close();
    throw error;
  }
}

async function initialiseDownloadedDatabase(
  url: string,
  integrity: DatabaseIntegrity,
  report?: (progress: LoadingProgress) => void,
): Promise<DatabaseInitResult> {
  const before = snapshotCounters(counters);
  const bytes = await downloadCompleteDatabase(url, integrity, counters, report);
  databaseSizeBytes = bytes.byteLength;
  pageSizeBytes = bytes[16] === 0 && bytes[17] === 1 ? 65_536 : bytes[16] * 256 + bytes[17];
  const sqlite = (await initSyncSQLite()) as unknown as SqliteModule;
  const candidate = deserializeDatabase(sqlite, bytes);
  try {
    return readyResult(validateDatabase(candidate, true), before);
  } catch (error: unknown) {
    candidate.close();
    throw error;
  }
}

const workerApi = {
  searchPage(query: string, afterRowid?: number): SearchPageResult {
    return execSearch(query, afterRowid);
  },

  getFeatureTypes(): string[] {
    const types: string[] = [];
    requireDatabase().exec({
      sql: "SELECT DISTINCT feature_type FROM feature_meta ORDER BY feature_type",
      rowMode: "array",
      callback: (row) => types.push(row[0]),
    });
    return types;
  },

  getDiagnostics(): TransferDiagnostics {
    return currentDiagnostics();
  },

  async initFromUrl(
    url: string,
    options: DatabaseInitOptions = {},
    report?: (progress: LoadingProgress) => void,
  ): Promise<DatabaseInitResult> {
    const startedAt = performance.now();
    disposeDatabase();
    counters = createTransferCounters();
    loadMode = options.mode ?? "range";
    databaseSizeBytes = options.expectedSizeBytes ?? null;
    pageSizeBytes = null;
    const integrity = { expectedSizeBytes: options.expectedSizeBytes, sha256: options.sha256 };
    try {
      const result =
        loadMode === "range"
          ? await initialiseRangeDatabase(url, integrity, report)
          : await initialiseDownloadedDatabase(url, integrity, report);
      return { ...result, elapsed_ms: performance.now() - startedAt };
    } catch (error: unknown) {
      database?.close();
      database = null;
      throw error;
    }
  },
};

export type WorkerApi = typeof workerApi;

Comlink.expose(workerApi);
