// Must match scripts/config.py for the database artifacts deployed with this UI.
export const SUPPORTED_SCHEMA_VERSION = 1;

type SqlBinding = string | number | undefined;

export interface SchemaReadableDatabase {
  selectObjects(sql: string, bindings: SqlBinding[]): unknown[];
}

export interface DatabaseMetadata {
  schemaVersion: number;
  generatorVersion: string;
}

const METADATA_QUERY = `
  SELECT schema_version, generator_version
  FROM database_metadata;
`;

function incompatibleDatabase(message: string): Error {
  return new Error(`Incompatible genomic feature database: ${message}`);
}

/** Read and validate the database contract before any feature query is allowed. */
export function readAndValidateSchemaMetadata(database: SchemaReadableDatabase): DatabaseMetadata {
  let rows: unknown[];
  try {
    rows = database.selectObjects(METADATA_QUERY, []);
  } catch {
    throw incompatibleDatabase(
      "schema-version metadata could not be read. Regenerate the database with the current indexer.",
    );
  }

  if (rows.length !== 1) {
    throw incompatibleDatabase(
      `expected exactly one metadata row, but found ${rows.length}. Regenerate the database with the current indexer.`,
    );
  }

  const row = rows[0];
  if (!row || typeof row !== "object") {
    throw incompatibleDatabase("the schema-version metadata row is malformed.");
  }

  const values = row as Record<string, unknown>;
  const schemaVersion = Number(values.schema_version);
  const generatorVersion = String(values.generator_version ?? "").trim();

  if (!Number.isInteger(schemaVersion) || schemaVersion < 1 || generatorVersion.length === 0) {
    throw incompatibleDatabase("the schema or generator version is malformed.");
  }

  if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw incompatibleDatabase(
      `schema version ${schemaVersion} is unsupported; this application supports schema version ${SUPPORTED_SCHEMA_VERSION}.`,
    );
  }

  return { schemaVersion, generatorVersion };
}
