import { describe, expect, it, vi } from "vitest";

import {
  readAndValidateSchemaMetadata,
  SUPPORTED_SCHEMA_VERSION,
  type SchemaReadableDatabase,
} from "./schema";

function databaseReturning(rows: unknown[]): SchemaReadableDatabase {
  return { selectObjects: vi.fn(() => rows) };
}

describe("readAndValidateSchemaMetadata", () => {
  it("accepts exactly one supported metadata row", () => {
    const database = databaseReturning([
      { schema_version: SUPPORTED_SCHEMA_VERSION, generator_version: "1.0.0" },
    ]);

    expect(readAndValidateSchemaMetadata(database)).toEqual({
      schemaVersion: SUPPORTED_SCHEMA_VERSION,
      generatorVersion: "1.0.0",
    });
    expect(database.selectObjects).toHaveBeenCalledWith(
      expect.stringContaining("FROM database_metadata"),
      [],
    );
  });

  it.each([
    [[]],
    [
      [
        { schema_version: 1, generator_version: "1" },
        { schema_version: 1, generator_version: "1" },
      ],
    ],
  ])("rejects a database with an invalid metadata row count", (rows) => {
    expect(() => readAndValidateSchemaMetadata(databaseReturning(rows))).toThrow(
      "expected exactly one metadata row",
    );
  });

  it.each([
    [[{ schema_version: "invalid", generator_version: "1.0.0" }]],
    [[{ schema_version: 1, generator_version: "" }]],
    [[null]],
  ])("rejects malformed metadata", (rows) => {
    expect(() => readAndValidateSchemaMetadata(databaseReturning(rows))).toThrow(
      /metadata row is malformed|schema or generator version is malformed/,
    );
  });

  it("rejects an unsupported schema version", () => {
    const database = databaseReturning([
      { schema_version: SUPPORTED_SCHEMA_VERSION + 1, generator_version: "2.0.0" },
    ]);

    expect(() => readAndValidateSchemaMetadata(database)).toThrow(
      `schema version ${SUPPORTED_SCHEMA_VERSION + 1} is unsupported`,
    );
  });

  it("reports missing or unreadable metadata as an incompatibility", () => {
    const database: SchemaReadableDatabase = {
      selectObjects: vi.fn(() => {
        throw new Error("no such table: database_metadata");
      }),
    };

    expect(() => readAndValidateSchemaMetadata(database)).toThrow(
      "schema-version metadata could not be read",
    );
  });
});
