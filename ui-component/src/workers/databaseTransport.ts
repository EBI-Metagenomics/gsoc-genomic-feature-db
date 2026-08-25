export type DatabaseLoadMode = "range" | "full-download";

export interface DatabaseIntegrity {
  expectedSizeBytes?: number;
  sha256?: string;
}

export interface TransferCounters {
  bytesReceived: number;
  requests: number;
  retries: number;
  lastFailure: "transient" | "protocol" | null;
}

export interface TransferSnapshot {
  bytesReceived: number;
  requests: number;
  retries: number;
}

export interface TransferDiagnostics extends TransferSnapshot {
  mode: DatabaseLoadMode;
  databaseSizeBytes: number | null;
  pageSizeBytes: number | null;
  operationBytesReceived: number;
  operationRequests: number;
  operationRetries: number;
}

export interface LoadingProgress {
  mode: DatabaseLoadMode;
  phase: "probing" | "opening" | "downloading" | "validating";
  loadedBytes: number;
  totalBytes: number | null;
  attempt: number;
}

export interface RangeProbeResult {
  databaseSizeBytes: number;
  pageSizeBytes: number;
  contentType: string | null;
  validator: string | null;
}

function representationValidator(headers: Headers): string | null {
  const etag = headers.get("ETag");
  if (etag && !/^W\//i.test(etag)) return etag;
  return headers.get("Last-Modified");
}

export class DatabaseTransportError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "DatabaseTransportError";
  }
}

export function createTransferCounters(): TransferCounters {
  return { bytesReceived: 0, requests: 0, retries: 0, lastFailure: null };
}

export function snapshotCounters(counters: TransferCounters): TransferSnapshot {
  return {
    bytesReceived: counters.bytesReceived,
    requests: counters.requests,
    retries: counters.retries,
  };
}

export function diagnosticsFrom(
  mode: DatabaseLoadMode,
  counters: TransferCounters,
  before: TransferSnapshot,
  databaseSizeBytes: number | null,
  pageSizeBytes: number | null,
): TransferDiagnostics {
  return {
    mode,
    databaseSizeBytes,
    pageSizeBytes,
    ...snapshotCounters(counters),
    operationBytesReceived: counters.bytesReceived - before.bytesReceived,
    operationRequests: counters.requests - before.requests,
    operationRetries: counters.retries - before.retries,
  };
}

export function parseContentRange(value: string | null) {
  const match = value?.match(/^bytes (\d+)-(\d+)\/(\d+)$/i);
  if (!match) return null;
  const [, start, end, total] = match.map(Number);
  if (![start, end, total].every(Number.isSafeInteger) || start > end || end >= total) return null;
  return { start, end, total };
}

export function sqliteHeader(bytes: Uint8Array): { pageSizeBytes: number } {
  const signature = new TextEncoder().encode("SQLite format 3\0");
  if (bytes.length < 100 || !signature.every((value, index) => bytes[index] === value)) {
    throw new DatabaseTransportError("The response is not a valid SQLite database.");
  }
  const encodedPageSize = bytes[16] * 256 + bytes[17];
  const pageSizeBytes = encodedPageSize === 1 ? 65_536 : encodedPageSize;
  const validPageSize =
    pageSizeBytes >= 512 && pageSizeBytes <= 65_536 && (pageSizeBytes & (pageSizeBytes - 1)) === 0;
  if (!validPageSize) {
    throw new DatabaseTransportError("The SQLite database has an invalid page-size header.");
  }
  return { pageSizeBytes };
}

export async function readBody(
  response: Response,
  counters: TransferCounters,
  expectedBytes: number,
  onChunk?: (loadedBytes: number) => void,
): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    counters.bytesReceived += bytes.byteLength;
    onChunk?.(bytes.byteLength);
    return bytes;
  }

  const bytes = new Uint8Array(expectedBytes);
  let offset = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (offset + value.byteLength > bytes.byteLength) {
      await reader.cancel();
      throw new DatabaseTransportError("The server returned more database bytes than declared.");
    }
    bytes.set(value, offset);
    offset += value.byteLength;
    counters.bytesReceived += value.byteLength;
    onChunk?.(offset);
  }
  if (offset !== expectedBytes) {
    throw new DatabaseTransportError(
      `The database response was incomplete: received ${offset} of ${expectedBytes} bytes.`,
      true,
    );
  }
  return bytes;
}

export function transientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function responseLength(response: Response): number {
  const value = Number(response.headers.get("Content-Length"));
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DatabaseTransportError("The database response has no valid Content-Length header.");
  }
  return value;
}

export async function waitForRetry(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
}

export async function probeRangeSupport(
  url: string,
  integrity: DatabaseIntegrity,
  counters: TransferCounters,
  report?: (progress: LoadingProgress) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<RangeProbeResult> {
  const requestedEnd = 99;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    report?.({
      mode: "range",
      phase: "probing",
      loadedBytes: 0,
      totalBytes: 100,
      attempt: attempt + 1,
    });
    counters.requests += 1;
    try {
      const response = await fetchImpl(url, {
        headers: { Range: `bytes=0-${requestedEnd}` },
        cache: "no-store",
      });
      if (response.status !== 206) {
        await response.body?.cancel();
        throw new DatabaseTransportError(
          `Range loading is unavailable: expected HTTP 206 but received ${response.status}.`,
          transientStatus(response.status),
        );
      }
      const range = parseContentRange(response.headers.get("Content-Range"));
      if (!range || range.start !== 0 || range.end !== requestedEnd) {
        await response.body?.cancel();
        throw new DatabaseTransportError(
          "Range loading is unavailable: invalid Content-Range header.",
        );
      }
      if (response.headers.get("Accept-Ranges")?.toLowerCase() !== "bytes") {
        await response.body?.cancel();
        throw new DatabaseTransportError(
          "Range loading is unavailable: Accept-Ranges: bytes is missing.",
        );
      }
      if (integrity.expectedSizeBytes && range.total !== integrity.expectedSizeBytes) {
        await response.body?.cancel();
        throw new DatabaseTransportError(
          `Database size mismatch: expected ${integrity.expectedSizeBytes} bytes but the server reports ${range.total}.`,
        );
      }
      const contentEncoding = response.headers.get("Content-Encoding");
      if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
        await response.body?.cancel();
        throw new DatabaseTransportError(
          "Range loading requires an uncompressed database response.",
        );
      }
      const length = responseLength(response);
      if (length !== 100) {
        await response.body?.cancel();
        throw new DatabaseTransportError(`Range probe returned ${length} bytes instead of 100.`);
      }
      const bytes = await readBody(response, counters, length, (loadedBytes) =>
        report?.({
          mode: "range",
          phase: "probing",
          loadedBytes,
          totalBytes: 100,
          attempt: attempt + 1,
        }),
      );
      const { pageSizeBytes } = sqliteHeader(bytes);
      counters.lastFailure = null;
      return {
        databaseSizeBytes: range.total,
        pageSizeBytes,
        contentType: response.headers.get("Content-Type"),
        validator: representationValidator(response.headers),
      };
    } catch (error: unknown) {
      const transportError =
        error instanceof DatabaseTransportError
          ? error
          : new DatabaseTransportError(`Database range probe failed: ${String(error)}`, true);
      counters.lastFailure = transportError.retryable ? "transient" : "protocol";
      if (!transportError.retryable || attempt === 2) throw transportError;
      counters.retries += 1;
      await waitForRetry(attempt);
    }
  }
  throw new DatabaseTransportError("Database range probe failed.");
}
