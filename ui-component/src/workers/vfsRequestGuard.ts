import {
  DatabaseTransportError,
  parseContentRange,
  type TransferCounters,
} from "./databaseTransport";

interface RequestMetadata {
  method: string;
  range: string | null;
}

function requestedRange(value: string | null) {
  const match = value?.match(/^bytes=(\d+)-(\d+)$/i);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end
    ? { start, end }
    : null;
}

function responseBytes(xhr: XMLHttpRequest): number {
  return xhr.response instanceof ArrayBuffer ? xhr.response.byteLength : 0;
}

function fail(counters: TransferCounters, message: string, transient = false): never {
  counters.lastFailure = transient ? "transient" : "protocol";
  throw new DatabaseTransportError(message, transient);
}

function validateHead(xhr: XMLHttpRequest, counters: TransferCounters, expectedSize: number): void {
  if (xhr.status === 0 || xhr.status >= 500 || xhr.status === 408 || xhr.status === 429) {
    fail(
      counters,
      `Database metadata request failed with HTTP ${xhr.status || "network error"}.`,
      true,
    );
  }
  if (xhr.status < 200 || xhr.status >= 300) {
    fail(counters, `Database metadata request failed with HTTP ${xhr.status}.`);
  }
  const length = Number(xhr.getResponseHeader("Content-Length"));
  if (length !== expectedSize) {
    fail(
      counters,
      `Database size changed during loading: expected ${expectedSize}, received ${length}.`,
    );
  }
  if (xhr.getResponseHeader("Accept-Ranges")?.toLowerCase() !== "bytes") {
    fail(counters, "Range loading is unavailable: Accept-Ranges: bytes is missing from HEAD.");
  }
}

function validateGet(
  xhr: XMLHttpRequest,
  rangeHeader: string | null,
  counters: TransferCounters,
  expectedSize: number,
  validator: string | null,
): void {
  const requested = requestedRange(rangeHeader);
  if (!requested) fail(counters, "The SQLite VFS issued an invalid byte-range request.");
  if (xhr.status === 0 || xhr.status >= 500 || xhr.status === 408 || xhr.status === 429) {
    fail(
      counters,
      `Database range request failed with HTTP ${xhr.status || "network error"}.`,
      true,
    );
  }
  if (xhr.status !== 206) {
    fail(
      counters,
      `Server ignored a database range request: expected HTTP 206 but received ${xhr.status}.`,
    );
  }
  const returned = parseContentRange(xhr.getResponseHeader("Content-Range"));
  if (!returned || returned.start !== requested.start || returned.total !== expectedSize) {
    fail(counters, "Database range response has an invalid Content-Range header.");
  }
  const expectedEnd = Math.min(requested.end, expectedSize - 1);
  const expectedLength = expectedEnd - requested.start + 1;
  const actualLength = responseBytes(xhr);
  if (returned.end !== expectedEnd || actualLength !== expectedLength) {
    fail(
      counters,
      `Database range response was incomplete: expected ${expectedLength} bytes, received ${actualLength}.`,
    );
  }
  const declaredLength = Number(xhr.getResponseHeader("Content-Length"));
  if (declaredLength !== actualLength) {
    fail(counters, "Database range response Content-Length does not match its body.");
  }
  const responseValidators = [
    xhr.getResponseHeader("ETag"),
    xhr.getResponseHeader("Last-Modified"),
  ];
  if (validator && responseValidators.some(Boolean) && !responseValidators.includes(validator)) {
    fail(counters, "The database changed while byte ranges were being loaded.");
  }
}

/**
 * Validate and measure the synchronous XHR calls made internally by sqlite-wasm-http.
 * The package has no transport hook, so this worker-local patch is pinned to its tested API surface.
 */
export function installVfsRequestGuard(
  counters: TransferCounters,
  expectedSize: number,
  validator: string | null = null,
): () => void {
  const metadata = new WeakMap<XMLHttpRequest, RequestMetadata>();
  const prototype = XMLHttpRequest.prototype;
  const originalOpen = prototype.open;
  const originalSetRequestHeader = prototype.setRequestHeader;
  const originalSend = prototype.send;

  prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async: boolean = true,
  ) {
    metadata.set(this, { method: method.toUpperCase(), range: null });
    return (
      originalOpen as unknown as (method: string, url: string | URL, async: boolean) => void
    ).call(this, method, url, async);
  } as typeof prototype.open;

  prototype.setRequestHeader = function (this: XMLHttpRequest, name: string, value: string) {
    const request = metadata.get(this);
    if (request && name.toLowerCase() === "range") request.range = value;
    return originalSetRequestHeader.call(this, name, value);
  };

  prototype.send = function (
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    const request = metadata.get(this);
    if (!request || (request.method !== "HEAD" && !request.range)) {
      return originalSend.call(this, body);
    }
    counters.requests += 1;
    counters.lastFailure = null;
    try {
      if (request.method === "GET" && request.range && validator) {
        originalSetRequestHeader.call(this, "If-Range", validator);
      }
      originalSend.call(this, body);
    } catch (error: unknown) {
      counters.lastFailure = "transient";
      throw new DatabaseTransportError(`Database request was interrupted: ${String(error)}`, true);
    }
    counters.bytesReceived += responseBytes(this);
    if (request.method === "HEAD") validateHead(this, counters, expectedSize);
    else validateGet(this, request.range, counters, expectedSize, validator);
  };

  return () => {
    prototype.open = originalOpen;
    prototype.setRequestHeader = originalSetRequestHeader;
    prototype.send = originalSend;
  };
}
