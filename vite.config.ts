import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DuckDB-Wasm requires SharedArrayBuffer → Cross-Origin Isolation headers.
// COEP "credentialless" (not "require-corp") lets same-origin pages load
// cross-origin no-credential resources while still enabling SAB.
// The DuckDB worker + wasm are now served from /public/duckdb/ (same-origin)
// so the browser can actually spawn the Worker without a Security Error.
const coiHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "credentialless",
};

export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    headers: coiHeaders,
  },
  preview: {
    headers: coiHeaders,
  },
  build: {
    // viteSingleFile inlines JS/CSS; we must keep .wasm/.worker.js external.
    // assetsInlineLimit: 0 prevents Vite from base64-inlining binary assets
    // that DuckDB fetches at runtime via fetch() — they must stay as files.
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  // Do NOT pre-bundle duckdb-wasm — it uses dynamic import() and Worker()
  // internally; pre-bundling breaks those runtime resolutions.
  optimizeDeps: {
    exclude: ["@duckdb/duckdb-wasm"],
  },
  worker: {
    format: "es",
  },
});
