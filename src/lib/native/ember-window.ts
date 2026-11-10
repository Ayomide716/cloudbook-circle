import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isNative } from "./platform";

/** Ember's own Android plugin (android/.../EmberWindowPlugin.java). */
interface EmberWindowPlugin {
  setSecure(options: { secure: boolean }): Promise<void>;
  setPictureInPicture(options: { enabled: boolean; width?: number; height?: number }): Promise<{ supported: boolean }>;
  authenticate(options: { title: string }): Promise<{ ok: boolean; reason?: string }>;
  addListener(event: "pictureInPicture", fn: (data: { active: boolean }) => void): Promise<PluginListenerHandle>;
}

const EmberWindow = registerPlugin<EmberWindowPlugin>("EmberWindow");

/**
 * No screenshots or screen recording while `secure` (a view-once photo is open). Only in the
 * app; a browser can't stop screenshots. An older APK without the plugin just ignores it.
 */
export function setScreenSecure(secure: boolean) {
  if (!isNative) return;
  EmberWindow.setSecure({ secure }).catch(() => {});
}

/** A video is playing (its size): leaving the app keeps it going in a floating window. */
export function setVideoPip(video: { width: number; height: number } | null) {
  if (!isNative) return;
  EmberWindow.setPictureInPicture(video ? { enabled: true, ...video } : { enabled: false }).catch(() => {});
}

/** Called when the app goes into or out of the floating window. */
export function onPictureInPicture(fn: (active: boolean) => void): () => void {
  if (!isNative) return () => {};
  let handle: PluginListenerHandle | null = null;
  let removed = false;
  EmberWindow.addListener("pictureInPicture", (d) => fn(d.active)).then((h) => { if (removed) h.remove(); else handle = h; }).catch(() => {});
  return () => { removed = true; handle?.remove(); };
}

/**
 * The phone's own fingerprint, face or screen-lock check (to open locked chats). "no-lock":
 * the phone has no screen lock; "unavailable": an older app without this.
 */
export async function deviceAuthenticate(title: string): Promise<"ok" | "failed" | "no-lock" | "unavailable"> {
  if (!isNative) return "unavailable";
  try {
    const r = await EmberWindow.authenticate({ title });
    return r.ok ? "ok" : r.reason === "no-lock" ? "no-lock" : r.reason === "unavailable" ? "unavailable" : "failed";
  } catch {
    return "unavailable";
  }
}
