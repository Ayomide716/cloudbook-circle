/**
 * Videos saved to the phone to watch without a connection (⋯ → Save for offline on a reel).
 * The video itself goes in the browser's Cache Storage; a short list of what's saved (title,
 * when) lives in localStorage. Saved videos also play from the phone, so they start at once.
 */
import { useSyncExternalStore } from "react";

const CACHE = "ember-offline-videos";
const KEY = "ember:offline-videos";

export interface OfflineVideo {
  url: string;
  title: string;
  savedAt: number;
  bytes: number;
}

const listeners = new Set<() => void>();
let snapshot: OfflineVideo[] = read();
function read(): OfflineVideo[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]") as OfflineVideo[];
  } catch {
    return [];
  }
}
function write(list: OfflineVideo[]) {
  snapshot = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Not remembered.
  }
  listeners.forEach((l) => l());
}

export const offlineSupported = () => typeof caches !== "undefined";

export function useOfflineVideos(): OfflineVideo[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => snapshot,
  );
}

export const isSavedOffline = (url: string) => snapshot.some((v) => v.url === url);

export async function saveOffline(url: string, title: string) {
  if (!offlineSupported()) throw new Error("This browser can't keep videos offline.");
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error(`Couldn't download it (${res.status}).`);
  const blob = await res.blob();
  const cache = await caches.open(CACHE);
  await cache.put(url, new Response(blob, { headers: { "Content-Type": blob.type || "video/mp4" } }));
  write([{ url, title, savedAt: Date.now(), bytes: blob.size }, ...snapshot.filter((v) => v.url !== url)]);
}

export async function removeOffline(url: string) {
  if (offlineSupported()) await (await caches.open(CACHE)).delete(url);
  write(snapshot.filter((v) => v.url !== url));
}

/** A local address for a saved video (revoke it when done), or null if it isn't saved. */
export async function offlineObjectUrl(url: string): Promise<string | null> {
  if (!offlineSupported() || !isSavedOffline(url)) return null;
  const hit = await (await caches.open(CACHE)).match(url);
  return hit ? URL.createObjectURL(await hit.blob()) : null;
}
