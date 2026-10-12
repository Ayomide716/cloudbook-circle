/**
 * Over-the-air updates for the Android app, from our own website (no app store, no Capgo cloud).
 *
 * Every website release also publishes the app's files as one zip, with /ota/manifest.json
 * saying which version it is (vite.config.ts). When the app opens or comes back to the
 * foreground it reads the manifest; if there's a newer version it downloads it quietly, and the
 * switch happens the next time you leave the app, so nothing changes under your finger.
 *
 * Safety:
 * - A version that can't start (never calls notifyAppReady) is rolled back automatically.
 * - A version that needs a newer APK (NATIVE_LEVEL) waits until people install that APK.
 */
import { PUBLIC_URL } from "./platform";
import { NATIVE_LEVEL } from "./native-level";

declare const __EMBER_VERSION__: string | undefined;

/** The version of the code that is running right now (the commit it was built from). */
export const BUNDLE_VERSION = typeof __EMBER_VERSION__ !== "undefined" ? __EMBER_VERSION__ : "dev";

export interface OtaManifest {
  version: string;
  /** Where the zip is, relative to the site (or a full https URL). */
  url: string;
  /** The NATIVE_LEVEL this version needs. */
  nativeLevel: number;
}

/** "1.<native level>.<build>" (android/app/build.gradle) → the APK's native level. */
export function shellLevelFrom(versionName: string | undefined): number {
  const level = Number(versionName?.split(".")[1]);
  return Number.isInteger(level) && level > 0 ? level : 1;
}

/** The zip to download, or null when there's nothing (safe) to update to. */
export function updateFor(manifest: unknown, running: string, shellLevel: number, site = PUBLIC_URL): { version: string; url: string } | null {
  if (!manifest || typeof manifest !== "object") return null;
  const m = manifest as Partial<OtaManifest>;
  if (typeof m.version !== "string" || !m.version || typeof m.url !== "string") return null;
  if (m.version === running) return null;
  if (typeof m.nativeLevel !== "number" || m.nativeLevel > shellLevel) return null;
  const url = m.url.startsWith("https://") ? m.url : m.url.startsWith("/") ? `${site}${m.url}` : null;
  return url ? { version: m.version, url } : null;
}

export async function startOverTheAirUpdates() {
  const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
  // This version started: keep it (otherwise the updater goes back to the last good one).
  await CapacitorUpdater.notifyAppReady().catch(() => {});

  const [{ App }, { CapacitorHttp }] = await Promise.all([import("@capacitor/app"), import("@capacitor/core")]);
  const shellLevel = shellLevelFrom((await App.getInfo().catch(() => null))?.version);
  let busy = false;
  let lastCheck = 0;

  const check = async () => {
    if (busy || Date.now() - lastCheck < 60_000) return;
    busy = true;
    lastCheck = Date.now();
    try {
      // Native request: no CORS, and never a cached answer.
      const res = await CapacitorHttp.get({ url: `${PUBLIC_URL}/ota/manifest.json?t=${Date.now()}`, headers: { "Cache-Control": "no-cache" } });
      const next = res.status === 200 ? updateFor(typeof res.data === "string" ? JSON.parse(res.data) : res.data, BUNDLE_VERSION, shellLevel) : null;
      if (!next) return;
      // Already downloaded earlier (e.g. the app was closed before switching)? Use that copy.
      const { bundles } = await CapacitorUpdater.list();
      const ready = bundles.find((b) => b.version === next.version && b.status !== "error");
      const bundle = ready ?? (await CapacitorUpdater.download({ url: next.url, version: next.version }));
      // Switches when the app goes to the background (or is next opened).
      await CapacitorUpdater.next({ id: bundle.id });
    } catch {
      // Offline or the site is down: try again next time the app comes to the front.
    } finally {
      busy = false;
    }
  };

  check();
  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) check();
  });
}
