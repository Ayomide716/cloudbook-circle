import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  // Public URL of the deployed site, used for canonical/Open Graph tags in index.html.
  const siteUrl = (env.VITE_SITE_URL || "").replace(/\/+$/, "");

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      {
        name: "inject-site-url",
        // Runs before Vite parses the HTML, so the placeholder never reaches its URL handling.
        transformIndexHtml: {
          order: "pre" as const,
          handler: (html: string) => html.replaceAll("%SITE_URL%", siteUrl),
        },
      },
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
