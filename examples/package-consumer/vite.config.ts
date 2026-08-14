import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { sampleDataPlugin } from "./dev/sampleDataPlugin";

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [sampleDataPlugin(), react()],
  worker: { format: "es" },
  optimizeDeps: {
    // The component stays unoptimized so Vite can transform its packaged
    // `new URL(..., import.meta.url)` worker entry. Prebundle its external
    // JBrowse graph explicitly so transitive CommonJS packages receive Vite's
    // normal compatibility conversion in development.
    include: ["@jbrowse/react-linear-genome-view2", "mobx"],
    exclude: [
      "genomic-feature-db-component",
      "@sqlite.org/sqlite-wasm",
      "sqlite-wasm-http",
    ],
  },
});
