import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import { sampleDataPlugin } from "./dev/sampleDataPlugin";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const bundleDemoData = mode === "demo";

  return {
    base: "/",
    // `sample_data` is a local fixture, not a production data source. Only the
    // explicit demo build copies it into dist; dev/preview use the middleware.
    publicDir: bundleDemoData ? "../sample_data" : false,
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
      copyPublicDir: bundleDemoData,
    },

    // Workers need to be bundled as ES modules for top-level await support.
    worker: {
      format: "es",
    },

    optimizeDeps: {
      exclude: ["@sqlite.org/sqlite-wasm", "sqlite-wasm-http"],
    },
  };
});
