import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { watchForUpdates } from "./lib/app-updates";

// Register service worker for offline caching
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration failed silently
    });
  });
}

watchForUpdates();

createRoot(document.getElementById("root")!).render(<App />);

// The installed app's "ember." splash (index.html) fades once the first screen has painted.
requestAnimationFrame(() => setTimeout(() => (window as Window & { __hideSplash?: () => void }).__hideSplash?.(), 0));
