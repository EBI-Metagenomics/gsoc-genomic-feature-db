import { describe, expect, it, vi } from "vitest";

import { downloadCompleteDatabase } from "./databaseDownload";
import {
  createTransferCounters,
  DatabaseTransportError,
  probeRangeSupport,
} from "./databaseTransport";

const DATABASE_SIZE_BYTES = 15_581_184;

function sqliteBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  bytes.set(new TextEncoder().encode("SQLite format 3\0"));
  bytes[16] = 0x10;
  bytes[17] = 0x00;
  return bytes;
}

function rangeResponse(bytes = sqliteBytes(100), status = 206): Response {
  return new Response(bytes.slice().buffer as ArrayBuffer, {
    status,
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Length": String(bytes.byteLength),
      "Content-Range": `bytes 0-99/${DATABASE_SIZE_BYTES}`,
      "Content-Type": "application/vnd.sqlite3",
      ETag: '"database-v1"',
    },
  });
}

describe("probeRangeSupport", () => {
  it("validates a bounded SQLite response and measures its actual body", async () => {
    const counters = createTransferCounters();
    const fetchMock = vi.fn(async () => rangeResponse());

    const result = await probeRangeSupport(
      "/features.db",
      { expectedSizeBytes: DATABASE_SIZE_BYTES },
      counters,
      undefined,
      fetchMock,
    );

    expect(result).toMatchObject({
      databaseSizeBytes: DATABASE_SIZE_BYTES,
      pageSizeBytes: 4096,
      validator: '"database-v1"',
    });
    expect(counters).toMatchObject({ bytesReceived: 100, requests: 1, retries: 0 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/features.db",
      expect.objectContaining({ headers: { Range: "bytes=0-99" } }),
    );
  });

  it("rejects a server that ignores Range without reading the full response", async () => {
    const counters = createTransferCounters();
    const fetchMock = vi.fn(async () => rangeResponse(sqliteBytes(100), 200));

    await expect(
      probeRangeSupport("/features.db", {}, counters, undefined, fetchMock),
    ).rejects.toThrow("expected HTTP 206 but received 200");
    expect(counters.bytesReceived).toBe(0);
    expect(counters.requests).toBe(1);
  });

  it("retries a transient server failure and records the retry", async () => {
    const counters = createTransferCounters();
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(rangeResponse());

    await probeRangeSupport("/features.db", {}, counters, undefined, fetchMock);

    expect(counters).toMatchObject({ bytesReceived: 100, requests: 2, retries: 1 });
  });

  it("uses Last-Modified instead of a weak ETag for If-Range", async () => {
    const counters = createTransferCounters();
    const bytes = sqliteBytes(100);
    const response = new Response(bytes.slice().buffer as ArrayBuffer, {
      status: 206,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": "100",
        "Content-Range": "bytes 0-99/1000",
        ETag: 'W/"weak"',
        "Last-Modified": "Wed, 12 Aug 2026 12:00:00 GMT",
      },
    });

    const result = await probeRangeSupport(
      "/features.db",
      {},
      counters,
      undefined,
      vi.fn(async () => response),
    );

    expect(result.validator).toBe("Wed, 12 Aug 2026 12:00:00 GMT");
  });
});

describe("downloadCompleteDatabase", () => {
  it("rejects incomplete content instead of opening it as SQLite", async () => {
    const counters = createTransferCounters();
    const fetchMock = vi.fn(
      async () =>
        new Response(sqliteBytes(100).buffer as ArrayBuffer, {
          status: 200,
          headers: { "Content-Length": "101" },
        }),
    );

    await expect(
      downloadCompleteDatabase("/features.db", {}, counters, undefined, fetchMock),
    ).rejects.toBeInstanceOf(DatabaseTransportError);
    expect(counters.retries).toBe(2);
    expect(counters.bytesReceived).toBe(300);
  });

  it("accepts a complete SQLite response and reports progress", async () => {
    const bytes = sqliteBytes(4096);
    const counters = createTransferCounters();
    const progress = vi.fn();
    const fetchMock = vi.fn(
      async () =>
        new Response(bytes.slice().buffer as ArrayBuffer, {
          status: 200,
          headers: { "Content-Length": String(bytes.length) },
        }),
    );

    const downloaded = await downloadCompleteDatabase(
      "/features.db",
      { expectedSizeBytes: bytes.length },
      counters,
      progress,
      fetchMock,
    );

    expect(downloaded).toEqual(bytes);
    expect(counters.bytesReceived).toBe(bytes.length);
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: "downloading", loadedBytes: bytes.length }),
    );
  });
});
