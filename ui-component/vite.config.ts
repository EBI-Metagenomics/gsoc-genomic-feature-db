import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { sampleDataPlugin } from "./dev/sampleDataPlugin";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/",
  publicDir: "../sample_data",
  plugins: [sampleDataPlugin(), react()],
  server: {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
  preview: {
    headers: {
      "Access-Control-Allow-Origin": "*",
    },
  },
  build: {
    copyPublicDir: false,
  },

  // Workers need to be bundled as ES modules for top-level await support.
  worker: {
    format: "es",
  },

  optimizeDeps: {
    exclude: ["@sqlite.org/sqlite-wasm", "sqlite-wasm-http"],
  },
});
