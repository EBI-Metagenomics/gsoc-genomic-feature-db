import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({// @ts-ignore
  base: process.env.VERCEL ? '/' : '/gsoc-genomic-feature-db/',
  publicDir: '../database',
  plugins: [react()],

  // Workers need to be bundled as ES modules for top-level await support.
  worker: {
    format: "es",
  },

  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm", "sqlite-wasm-http"],
  },
});
