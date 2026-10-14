import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { createHash } from "crypto";
import { zipSync } from "fflate";
import type { Plugin } from "vite";

// The commit this build is from. The Android app compares it with the website's to know when
// there's a new version (src/lib/native/ota.ts). Vercel and GitHub both build the same commit,
// so the APK and the site agree on what "this version" is.
const gitSha = () => {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
};
const appVersion = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || gitSha() || `local-${Date.now().toString(36)}`).slice(0, 12);

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

// Over-the-air updates: the whole build as one zip, plus /ota/manifest.json naming the version
// and the native level it needs. The app downloads it from the website (src/lib/native/ota.ts).
const overTheAirBundle = (): Plugin => {
  let outDir = "dist";
  return {
    name: "over-the-air-bundle",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (!fs.existsSync(path.join(outDir, "index.html"))) return;
      const files: Record<string, Uint8Array> = {};
      const walk = (dir: string, prefix = "") => {
        for (const name of fs.readdirSync(dir)) {
          const full = path.join(dir, name);
          const rel = prefix + name;
          if (rel === "ota" || rel === "sw.js") continue; // the app doesn't use the web service worker
          if (fs.statSync(full).isDirectory()) walk(full, `${rel}/`);
          else files[rel] = fs.readFileSync(full);
        }
      };
      walk(outDir);
      const level = Number(fs.readFileSync(path.resolve(__dirname, "src/lib/native/native-level.ts"), "utf8").match(/NATIVE_LEVEL = (\d+)/)?.[1] ?? 1);
      fs.mkdirSync(path.join(outDir, "ota"), { recursive: true });
      const zip = zipSync(files, { level: 9 });
      fs.writeFileSync(path.join(outDir, "ota", `${appVersion}.zip`), zip);
      // The updater refuses downloads without the zip's SHA-256 (and checks it after download).
      const checksum = createHash("sha256").update(zip).digest("hex");
      fs.writeFileSync(
        path.join(outDir, "ota", "manifest.json"),
        JSON.stringify({ version: appVersion, url: `/ota/${appVersion}.zip`, checksum, nativeLevel: level, builtAt: new Date().toISOString() }, null, 2),
      );
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), stampServiceWorker(), overTheAirBundle()],
  define: {
    __EMBER_VERSION__: JSON.stringify(appVersion),
  },
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
