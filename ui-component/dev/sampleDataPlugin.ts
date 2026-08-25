import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";

import type { Plugin } from "vite";

const sampleRoot = fileURLToPath(new URL("../../sample_data", import.meta.url));
const benchmarkDatabaseRoute = "/__benchmark__/database.db.zip";
const runtimePath =
  /^\/([A-Za-z0-9_.-]+)\/\1\.(?:db\.zip|fna|fna\.fai|gff\.gz|gff\.gz\.(?:tbi|csi))$/;

function contentType(pathname: string): string {
  if (pathname.endsWith(".gff.gz")) return "application/gzip";
  if (pathname.endsWith(".db.zip")) return "application/vnd.sqlite3";
  if (pathname.endsWith(".fna") || pathname.endsWith(".fna.fai")) return "text/plain";
  return "application/octet-stream";
}

function byteRange(value: string | undefined, size: number): [number, number] | null {
  if (!value) return null;
  const match = value.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[2] && match[1] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return Number.isInteger(start) && Number.isInteger(end) && start <= end && start < size
    ? [start, end]
    : null;
}

function installSampleDataMiddleware(server: {
  middlewares: {
    use: (
      handler: (
        request: IncomingMessage,
        response: ServerResponse,
        next: (error?: unknown) => void,
      ) => void | Promise<void>,
    ) => void;
  };
}) {
  server.middlewares.use(async (request, response, next) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const configuredBenchmarkPath = process.env.BENCHMARK_DATABASE_PATH;
    const isBenchmarkDatabase =
      pathname === benchmarkDatabaseRoute && Boolean(configuredBenchmarkPath);
    if (!runtimePath.test(pathname) && !isBenchmarkDatabase) {
      next();
      return;
    }

    const filePath = isBenchmarkDatabase
      ? resolve(configuredBenchmarkPath as string)
      : resolve(sampleRoot, `.${decodeURIComponent(pathname)}`);
    if (!isBenchmarkDatabase && !filePath.startsWith(`${resolve(sampleRoot)}${sep}`)) {
      next();
      return;
    }

    try {
      const file = await stat(filePath);
      if (!file.isFile()) {
        next();
        return;
      }

      const requestedRange = request.headers.range;
      const range = byteRange(requestedRange, file.size);
      response.setHeader("Accept-Ranges", "bytes");
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader(
        "Access-Control-Expose-Headers",
        "Accept-Ranges, Content-Length, Content-Range, ETag, Last-Modified",
      );
      response.setHeader("Cache-Control", "no-cache");
      response.setHeader("ETag", `W/"${file.size}-${file.mtimeMs}"`);
      response.setHeader("Last-Modified", file.mtime.toUTCString());
      response.setHeader("Content-Type", contentType(pathname));
      if (requestedRange && !range) {
        response.statusCode = 416;
        response.setHeader("Content-Range", `bytes */${file.size}`);
        response.setHeader("Content-Length", 0);
        response.end();
        return;
      }
      const [start, end] = range ?? [0, file.size - 1];
      response.statusCode = range ? 206 : 200;
      response.setHeader("Content-Length", end - start + 1);
      if (range) response.setHeader("Content-Range", `bytes ${start}-${end}/${file.size}`);

      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(filePath, { start, end }).on("error", next).pipe(response);
    } catch (error: unknown) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code === "ENOENT") {
        next();
        return;
      }
      next(error);
    }
  });
}

export function sampleDataPlugin(): Plugin {
  return {
    name: "raw-range-sample-data",
    configureServer(server) {
      installSampleDataMiddleware(server);
    },
    configurePreviewServer(server) {
      installSampleDataMiddleware(server);
    },
  };
}
