import type { CapacitorConfig } from "@capacitor/cli";

// The Android app: Ember's own web build inside a native shell (no website in a frame), so it
// opens instantly and works offline. New versions arrive over the air: see src/lib/native/ota.ts.
const config: CapacitorConfig = {
  appId: "app.ember.social",
  appName: "Ember",
  webDir: "dist",
  plugins: {
    SystemBars: {
      // Edge to edge, with the phone's real safe areas in env(safe-area-inset-*), as the
      // website already expects (viewport-fit=cover in index.html).
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
    },
    SplashScreen: {
      // Hidden by the app once the first screen has painted (src/lib/native/index.ts).
      launchAutoHide: false,
      backgroundColor: "#F7F3EE",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    Keyboard: {
      // The page shrinks above the keyboard, as on the website (interactive-widget=resizes-content).
      resize: "native",
      resizeOnFullScreen: true,
    },
    CapacitorUpdater: {
      // Our own updates, from our own site: never Capgo's cloud, and no stats sent anywhere.
      autoUpdate: false,
      statsUrl: "",
      channelUrl: "",
      updateUrl: "",
      // If a new version can't start (it never says "ready"), go back to the last good one.
      appReadyTimeout: 15000,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      // A new APK always starts from the version built into it.
      resetWhenUpdate: true,
    },
  },
};

export default config;
