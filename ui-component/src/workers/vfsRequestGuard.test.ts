import { afterEach, describe, expect, it, vi } from "vitest";

import { createTransferCounters } from "./databaseTransport";
import { installVfsRequestGuard } from "./vfsRequestGuard";

class FakeXMLHttpRequest {
  static status = 206;
  static body = new ArrayBuffer(100);
  static headers: Record<string, string> = {
    "accept-ranges": "bytes",
    "content-length": "100",
    "content-range": "bytes 0-99/1000",
  };

  status = FakeXMLHttpRequest.status;
  response: unknown = FakeXMLHttpRequest.body;
  responseType = "";
  requestHeaders: Record<string, string> = {};

  open(...arguments_: unknown[]): void {
    void arguments_;
  }

  setRequestHeader(name: string, value: string): void {
    this.requestHeaders[name.toLowerCase()] = value;
  }

  send(): void {}

  getResponseHeader(name: string): string | null {
    return FakeXMLHttpRequest.headers[name.toLowerCase()] ?? null;
  }
}

describe("installVfsRequestGuard", () => {
  afterEach(() => vi.unstubAllGlobals());

  function request(status = 206, bodyBytes = 100, headers = FakeXMLHttpRequest.headers) {
    FakeXMLHttpRequest.status = status;
    FakeXMLHttpRequest.body = new ArrayBuffer(bodyBytes);
    FakeXMLHttpRequest.headers = headers;
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    const counters = createTransferCounters();
    const restore = installVfsRequestGuard(counters, 1000);
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "/features.db", false);
    xhr.setRequestHeader("Range", "bytes=0-99");
    return { counters, restore, xhr };
  }

  it("accepts and measures a valid bounded response", () => {
    const { counters, restore, xhr } = request();
    expect(() => xhr.send()).not.toThrow();
    expect(counters).toMatchObject({ bytesReceived: 100, requests: 1, lastFailure: null });
    restore();
  });

  it("rejects a full 200 response even when it contains SQLite data", () => {
    const { counters, restore, xhr } = request(200, 1000, {
      "accept-ranges": "bytes",
      "content-length": "1000",
    });
    expect(() => xhr.send()).toThrow("expected HTTP 206 but received 200");
    expect(counters).toMatchObject({ bytesReceived: 1000, requests: 1, lastFailure: "protocol" });
    restore();
  });

  it("rejects a truncated partial response", () => {
    const { counters, restore, xhr } = request(206, 50, {
      "accept-ranges": "bytes",
      "content-length": "50",
      "content-range": "bytes 0-99/1000",
    });
    expect(() => xhr.send()).toThrow("expected 100 bytes, received 50");
    expect(counters.lastFailure).toBe("protocol");
    restore();
  });

  it("pins range reads to the representation validated by the probe", () => {
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);
    FakeXMLHttpRequest.status = 206;
    FakeXMLHttpRequest.body = new ArrayBuffer(100);
    FakeXMLHttpRequest.headers = {
      "accept-ranges": "bytes",
      "content-length": "100",
      "content-range": "bytes 0-99/1000",
      etag: '"database-v1"',
    };
    const counters = createTransferCounters();
    const restore = installVfsRequestGuard(counters, 1000, '"database-v1"');
    const xhr = new XMLHttpRequest() as unknown as FakeXMLHttpRequest;
    xhr.open("GET", "/features.db", false);
    xhr.setRequestHeader("Range", "bytes=0-99");
    xhr.send();

    expect(xhr.requestHeaders["if-range"]).toBe('"database-v1"');
    restore();
  });
});
