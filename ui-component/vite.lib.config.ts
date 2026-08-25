import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const peerDependencies = new Set([
  "@jbrowse/react-linear-genome-view2",
  "mobx",
  "react",
  "react-dom",
]);

function isExternalDependency(id: string): boolean {
  return [...peerDependencies].some(
    (dependency) => id === dependency || id.startsWith(`${dependency}/`),
  );
}

export default defineConfig({
  base: "./",
  build: {
    copyPublicDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: fileURLToPath(new URL("./src/library.ts", import.meta.url)),
      external: isExternalDependency,
      preserveEntrySignatures: "strict",
      output: {
        entryFileNames: "index.js",
        assetFileNames: (asset) =>
          asset.name?.endsWith(".css") ? "styles.css" : "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
      },
    },
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm", "sqlite-wasm-http"],
  },
});
