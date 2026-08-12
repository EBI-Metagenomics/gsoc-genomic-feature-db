import { readAndValidateSchemaMetadata } from "./schema";

export type SqlBinding = string | number | undefined;

export interface DatabaseHandle {
  pointer: number;
  selectObjects(sql: string, bindings: SqlBinding[]): unknown[];
  selectValue(sql: string): unknown;
  exec(options: { sql: string; rowMode: "array"; callback: (row: string[]) => void }): void;
  close(): void;
  checkRc(resultCode: number): void;
}

export interface SqliteModule {
  oo1: {
    DB: new (options?: { filename?: string; vfs?: "http" } | string) => DatabaseHandle;
  };
  capi: {
    sqlite3_deserialize(
      databasePointer: number,
      schema: string,
      dataPointer: number,
      dataSize: bigint,
      bufferSize: bigint,
      flags: number,
    ): number;
  };
  wasm: {
    allocFromTypedArray(bytes: Uint8Array): number;
    dealloc(pointer: number): void;
  };
}

export interface ValidatedDatabase {
  database: DatabaseHandle;
  schemaVersion: number;
  generatorVersion: string;
  rowCount: number;
}

export function validateDatabase(
  candidate: DatabaseHandle,
  runIntegrityCheck: boolean,
): ValidatedDatabase {
  if (runIntegrityCheck) {
    const result = String(candidate.selectValue("PRAGMA quick_check"));
    if (result.toLowerCase() !== "ok") {
      throw new Error(`Downloaded SQLite database failed PRAGMA quick_check: ${result}`);
    }
    databaseQueryOnly(candidate);
  }
  const metadata = readAndValidateSchemaMetadata(candidate);
  const rowCount = Number(candidate.selectValue("SELECT max(rowid) FROM feature_meta")) || 0;
  return { database: candidate, ...metadata, rowCount };
}

function databaseQueryOnly(database: DatabaseHandle): void {
  database.selectValue("PRAGMA query_only=ON");
  if (Number(database.selectValue("PRAGMA query_only")) !== 1) {
    throw new Error("Downloaded SQLite database could not be switched to query-only mode.");
  }
}

/** Deserialize a verified complete response into a read-only in-memory database. */
export function deserializeDatabase(sqlite: SqliteModule, bytes: Uint8Array): DatabaseHandle {
  const candidate = new sqlite.oo1.DB();
  const dataPointer = sqlite.wasm.allocFromTypedArray(bytes);
  let sqliteOwnsBuffer = false;
  try {
    // SQLite owns the in-memory copy. It is switched to query_only after quick_check.
    const resultCode = sqlite.capi.sqlite3_deserialize(
      candidate.pointer,
      "main",
      dataPointer,
      BigInt(bytes.byteLength),
      BigInt(bytes.byteLength),
      1,
    );
    candidate.checkRc(resultCode);
    sqliteOwnsBuffer = true;
    return candidate;
  } catch (error: unknown) {
    if (!sqliteOwnsBuffer) sqlite.wasm.dealloc(dataPointer);
    candidate.close();
    throw error;
  }
}
