import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "@fontsource-variable/figtree";
import "./index.css";
import { reloadOnNewVersion, watchForUpdates } from "./lib/app-updates";
import { isNative } from "./lib/native/platform";
import { initNative } from "./lib/native";
import { captureReferral } from "./lib/referral";

// Opened from someone's invite link (?ref=…): remember who, for after sign-up.
captureReferral();

if (isNative) {
  // The Android app: its updates come over the air (src/lib/native/ota.ts), not from the
  // website's service worker.
  initNative();
} else {
  // Register service worker for offline caching
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      // updateViaCache "none": always fetch sw.js fresh, so a new release is noticed right away.
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(reloadOnNewVersion).catch(() => {
        // SW registration failed silently
      });
    });
  }

  watchForUpdates();
}

createRoot(document.getElementById("root")!).render(<App />);

// The installed app's "ember." splash (index.html) fades once the first screen has painted.
requestAnimationFrame(() => setTimeout(() => (window as Window & { __hideSplash?: () => void }).__hideSplash?.(), 0));
