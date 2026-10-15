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
      // No logo screen: a plain dark one (the colour of the web splash) that gives way to the
      // app's own "ember." typing splash (index.html) as soon as the app has loaded.
      launchAutoHide: false,
      backgroundColor: "#0C0C0E",
      androidSplashResourceName: "splash_blank",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    Keyboard: {
      // The page shrinks above the keyboard, as on the website (interactive-widget=resizes-content).
      // SystemBars already makes room for the keyboard on Android, so Keyboard.resizeOnFullScreen
      // must stay off: with both, the app was resized twice and sheets could vanish.
      resize: "native",
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
