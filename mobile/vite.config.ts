/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Send COOP/COEP headers in dev so SharedArrayBuffer is available — required
// by the multi-threaded wllama build that the LLM-OS demos at
// /demos/{tetris,scavenger}/ load. Single-thread wllama (the existing chat
// flow) doesn't strictly need this, but the demos do, and the headers are
// harmless for the chat flow.
const coopCoepPlugin = {
  name: "coop-coep",
  configureServer(server: { middlewares: { use: (cb: (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      next();
    });
  },
};

export default defineConfig({
  plugins: [svelte(), coopCoepPlugin],
  resolve: {
    alias: {
      $lib: "/src/lib",
      $components: "/src/components",
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  worker: {
    // ES-module workers so Vite can code-split dynamic imports (e.g. wllama
    // is dynamically imported inside wllama_worker.ts).
    format: "es",
  },
  build: {
    rollupOptions: {
      // The LiteRT Capacitor plugin (M10) is only installed under
      // capacitor-plugins/ and lands in node_modules after users run
      // `npm install file:./capacitor-plugins/litert-lm`. Externalize so the
      // dynamic import falls through to the runtime "plugin not installed"
      // error path with graceful degradation.
      external: [/^@skillos\/capacitor-litert-lm(\/.*)?$/],
    },
  },
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.spec.ts"],
    setupFiles: ["./tests/setup.ts"],
  },
});
