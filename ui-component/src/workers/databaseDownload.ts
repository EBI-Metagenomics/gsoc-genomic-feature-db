import {
  DatabaseTransportError,
  type DatabaseIntegrity,
  type LoadingProgress,
  type TransferCounters,
  readBody,
  responseLength,
  sqliteHeader,
  transientStatus,
  waitForRetry,
} from "./databaseTransport";

/** Download and verify a complete database after the user explicitly selects fallback mode. */
export async function downloadCompleteDatabase(
  url: string,
  integrity: DatabaseIntegrity,
  counters: TransferCounters,
  report?: (progress: LoadingProgress) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    counters.requests += 1;
    try {
      const response = await fetchImpl(url, { cache: "no-store" });
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new DatabaseTransportError(
          `Complete database download failed with HTTP ${response.status}.`,
          transientStatus(response.status),
        );
      }
      const length = responseLength(response);
      if (integrity.expectedSizeBytes && length !== integrity.expectedSizeBytes) {
        await response.body?.cancel();
        throw new DatabaseTransportError(
          `Database size mismatch: expected ${integrity.expectedSizeBytes} bytes but received ${length}.`,
        );
      }
      const bytes = await readBody(response, counters, length, (loadedBytes) =>
        report?.({
          mode: "full-download",
          phase: "downloading",
          loadedBytes,
          totalBytes: length,
          attempt: attempt + 1,
        }),
      );
      sqliteHeader(bytes);
      if (integrity.sha256) {
        report?.({
          mode: "full-download",
          phase: "validating",
          loadedBytes: length,
          totalBytes: length,
          attempt: attempt + 1,
        });
        const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer);
        const actual = Array.from(new Uint8Array(digest), (value) =>
          value.toString(16).padStart(2, "0"),
        ).join("");
        if (actual !== integrity.sha256.replace(/^sha256:/i, "").toLowerCase()) {
          throw new DatabaseTransportError(
            "The downloaded database failed its SHA-256 integrity check.",
          );
        }
      }
      counters.lastFailure = null;
      return bytes;
    } catch (error: unknown) {
      const transportError =
        error instanceof DatabaseTransportError
          ? error
          : new DatabaseTransportError(`Complete database download failed: ${String(error)}`, true);
      counters.lastFailure = transportError.retryable ? "transient" : "protocol";
      if (!transportError.retryable || attempt === 2) throw transportError;
      counters.retries += 1;
      await waitForRetry(attempt);
    }
  }
  throw new DatabaseTransportError("Complete database download failed.");
}
