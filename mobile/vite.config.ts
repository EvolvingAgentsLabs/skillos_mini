import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Send COOP/COEP headers in dev so SharedArrayBuffer is available — required
// by the multi-threaded wllama build that the LLM-OS demos at
// /demos/{tetris,scavenger}/ load.
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
    format: "es",
  },
});
