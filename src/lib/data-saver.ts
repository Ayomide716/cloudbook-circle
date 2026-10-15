/**
 * Data saver (Settings → Data saver), as in Facebook's app: videos don't play or load until you
 * tap them, and reels don't load the next one ahead. On by itself when the phone's own data
 * saver is on, unless you turned it off here.
 */
import { useSyncExternalStore } from "react";

const KEY = "ember:data-saver";
type Choice = "on" | "off" | "auto";
const listeners = new Set<() => void>();

function choice(): Choice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "on" || v === "off" ? v : "auto";
  } catch {
    return "auto";
  }
}

const phoneSavesData = () =>
  typeof navigator !== "undefined" && !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;

export function isDataSaver(): boolean {
  const c = choice();
  return c === "on" || (c === "auto" && phoneSavesData());
}

export function setDataSaver(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Not remembered (private mode).
  }
  listeners.forEach((l) => l());
}

export function useDataSaver(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    isDataSaver,
    () => false,
  );
}
