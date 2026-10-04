import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
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
