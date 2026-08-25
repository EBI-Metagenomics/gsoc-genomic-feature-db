import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, preview } from "vite";

export default async function startTestServer() {
  const consumerRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const production = process.env.PACKAGE_CONSUMER_PREVIEW === "1";
  const port = production ? 4181 : 4180;
  const shared = {
    host: "127.0.0.1",
    port,
    strictPort: true,
  };
  if (production) {
    const server = await preview({
      root: consumerRoot,
      configFile: resolve(consumerRoot, "vite.config.ts"),
      preview: shared,
    });
    return async () => {
      await server.close();
    };
  }

  const server = await createServer({
    root: consumerRoot,
    configFile: resolve(consumerRoot, "vite.config.ts"),
    server: shared,
  });
  await server.listen();
  return async () => {
    await server.close();
  };
}
