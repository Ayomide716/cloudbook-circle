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
  /** SHA-256 of the zip, in hex: the updater won't download without it. */
  checksum: string;
  /** The NATIVE_LEVEL this version needs. */
  nativeLevel: number;
}

/** "1.<native level>.<build>" (android/app/build.gradle) → the APK's native level. */
export function shellLevelFrom(versionName: string | undefined): number {
  const level = Number(versionName?.split(".")[1]);
  return Number.isInteger(level) && level > 0 ? level : 1;
}

/** The zip to download, or null when there's nothing (safe) to update to. */
export function updateFor(manifest: unknown, running: string, shellLevel: number, site = PUBLIC_URL): { version: string; url: string; checksum: string } | null {
  if (!manifest || typeof manifest !== "object") return null;
  const m = manifest as Partial<OtaManifest>;
  if (typeof m.version !== "string" || !m.version || typeof m.url !== "string") return null;
  if (typeof m.checksum !== "string" || !/^[0-9a-f]{64}$/.test(m.checksum)) return null;
  if (m.version === running) return null;
  if (typeof m.nativeLevel !== "number" || m.nativeLevel > shellLevel) return null;
  const url = m.url.startsWith("https://") ? m.url : m.url.startsWith("/") ? `${site}${m.url}` : null;
  return url ? { version: m.version, url, checksum: m.checksum } : null;
}

export type UpdateCheck = "up-to-date" | "ready" | "needs-new-app" | "offline" | "failed";

/** Why the last check failed, in words (shown under "Check for updates"). */
let lastError = "";
export const lastUpdateError = () => lastError;

let busy: Promise<UpdateCheck> | null = null;
let lastCheck = 0;
let shellLevel: number | null = null;

/**
 * Look for a newer version and download it. It switches when you next leave the app, or
 * straight away with applyNow (the "Check for updates" button in Settings).
 */
export function checkForUpdate({ force = false, applyNow = false } = {}): Promise<UpdateCheck> {
  if (busy) return busy;
  if (!force && Date.now() - lastCheck < 60_000) return Promise.resolve("up-to-date");
  lastCheck = Date.now();
  busy = (async (): Promise<UpdateCheck> => {
    try {
      const [{ CapacitorUpdater }, { App }, { CapacitorHttp }] = await Promise.all([
        import("@capgo/capacitor-updater"),
        import("@capacitor/app"),
        import("@capacitor/core"),
      ]);
      shellLevel ??= shellLevelFrom((await App.getInfo().catch(() => null))?.version);
      // Native request: no CORS, and never a cached answer.
      lastError = "";
      let res;
      try {
        res = await CapacitorHttp.get({ url: `${PUBLIC_URL}/ota/manifest.json?t=${Date.now()}`, headers: { "Cache-Control": "no-cache" } });
      } catch {
        return "offline";
      }
      if (res.status !== 200) {
        lastError = `The update list answered ${res.status}.`;
        return "failed";
      }
      const manifest = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      const next = updateFor(manifest, BUNDLE_VERSION, shellLevel);
      if (!next) {
        const needsApp = typeof manifest?.nativeLevel === "number" && manifest.nativeLevel > shellLevel && manifest.version !== BUNDLE_VERSION;
        return needsApp ? "needs-new-app" : "up-to-date";
      }
      // Already downloaded earlier (e.g. the app was closed before switching)? Use that copy.
      const { bundles } = await CapacitorUpdater.list();
      const ready = bundles.find((b) => b.version === next.version && b.status !== "error");
      const bundle = ready ?? (await CapacitorUpdater.download({ url: next.url, version: next.version, checksum: next.checksum }));
      if (applyNow) await CapacitorUpdater.set({ id: bundle.id }); // reloads into the new version
      else await CapacitorUpdater.next({ id: bundle.id }); // switches when the app goes to the background
      return "ready";
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn("[ota] update failed:", lastError);
      return "failed";
    } finally {
      busy = null;
    }
  })();
  return busy;
}

/** "1.1.3" for the APK, and the short commit of the version running inside it. */
export async function versionInfo() {
  const { App } = await import("@capacitor/app");
  const info = await App.getInfo().catch(() => null);
  return { app: info?.version ?? "?", web: BUNDLE_VERSION.slice(0, 7) };
}

export async function startOverTheAirUpdates() {
  const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
  // This version started: keep it (otherwise the updater goes back to the last good one).
  await CapacitorUpdater.notifyAppReady().catch(() => {});

  const { App } = await import("@capacitor/app");
  checkForUpdate({ force: true });
  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) checkForUpdate();
  });
}
