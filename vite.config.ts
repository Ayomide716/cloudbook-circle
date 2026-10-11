import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import type { Plugin } from "vite";

// Every release gets its own service worker: the build stamps sw.js with a new version, so
// phones with the app installed notice the release, switch to it and reload (see sw.js).
const stampServiceWorker = (): Plugin => {
  let outDir = "dist";
  return {
    name: "stamp-service-worker",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const file = path.resolve(outDir, "sw.js");
      if (!fs.existsSync(file)) return;
      const version = `ember-${Date.now().toString(36)}`;
      const source = fs.readFileSync(file, "utf8");
      fs.writeFileSync(file, source.replace(/const CACHE_VERSION = "[^"]*";/, `const CACHE_VERSION = "${version}";`));
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), stampServiceWorker()],
  build: {
    rollupOptions: {
      output: {
        // Without this, every shared icon and date helper becomes its own tiny file
        // (53 JS requests on the home feed), loaded as a chain of round trips.
        manualChunks(id: string) {
          if (id.includes("node_modules/lucide-react")) return "icons";
          if (id.includes("node_modules/date-fns")) return "date";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
