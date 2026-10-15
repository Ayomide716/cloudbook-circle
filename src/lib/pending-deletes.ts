/**
 * Deleting a post shows "Post deleted · Undo" for 5 seconds before it's really deleted.
 *
 * Two things made deleted posts come back:
 * - Closing the app or reloading inside those 5 seconds cancelled the delete. Now, the moment
 *   the app is hidden, closed or reloaded, waiting deletes are sent at once (keepalive, so the
 *   request survives the page going away).
 * - Other screens (Home after deleting on your profile) kept their copy of the feed. Now a
 *   deleted post is hidden everywhere it's shown, straight away.
 */
import { useSyncExternalStore } from "react";

interface Pending {
  timer: number;
  /** The normal delete (supabase-js). */
  run: () => void;
  /** The same delete as a request that outlives the page (else `run` is tried as the page goes). */
  url?: string;
  headers?: Record<string, string>;
}

const pending = new Map<string, Pending>();
const deleted = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function hideEverywhere(id: string) {
  deleted.add(id);
  emit();
}

export function showAgain(id: string) {
  deleted.delete(id);
  emit();
}

/** True once this post was deleted (or is about to be) in this session. */
export function useHiddenEverywhere(id: string): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => deleted.has(id),
  );
}

/** Deletes after `delayMs` unless cancelled; sent at once if the app is hidden or closed first. */
export function deleteLater(id: string, delayMs: number, p: Omit<Pending, "timer">) {
  cancelDelete(id);
  const timer = window.setTimeout(() => {
    pending.delete(id);
    p.run();
  }, delayMs);
  pending.set(id, { ...p, timer });
}

export function cancelDelete(id: string) {
  const p = pending.get(id);
  if (p) window.clearTimeout(p.timer);
  pending.delete(id);
}

/** Run a waiting delete now (e.g. its card is going off screen). */
export function deleteNow(id: string) {
  const p = pending.get(id);
  if (!p) return;
  window.clearTimeout(p.timer);
  pending.delete(id);
  p.run();
}

function flushAll() {
  for (const [id, p] of pending) {
    window.clearTimeout(p.timer);
    pending.delete(id);
    if (!p.url) {
      p.run();
      continue;
    }
    try {
      void fetch(p.url, { method: "DELETE", headers: p.headers, keepalive: true });
    } catch {
      p.run();
    }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });
}
