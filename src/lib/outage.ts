/**
 * Notices when Ember's server (Supabase) stops answering, so the app can show "We'll be right
 * back" instead of broken, endlessly loading pages: a 402 (the project is paused for going over
 * its plan), or several server errors or failed requests in a row while the phone is online.
 * Any good answer clears it. Every request to Supabase goes through watchedFetch.
 */
import { useSyncExternalStore } from "react";

export type Outage = null | "paused" | "down";

let outage: Outage = null;
let failures = 0;
const listeners = new Set<() => void>();
const set = (next: Outage) => {
  if (next === outage) return;
  outage = next;
  listeners.forEach((l) => l());
};

const isFunction = (input: RequestInfo | URL) => String(input instanceof Request ? input.url : input).includes("/functions/v1/");

export async function watchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(input, init);
    if (res.status === 402) set("paused");
    // A server function's own error (an upload, say) isn't the whole service being down.
    else if (res.status >= 500 && !isFunction(input)) {
      if (++failures >= 3) set("down");
    } else {
      failures = 0;
      set(null);
    }
    return res;
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === "AbortError";
    // Offline is the connection bar's job; this is for the server not answering.
    if (!aborted && typeof navigator !== "undefined" && navigator.onLine && ++failures >= 4) set("down");
    throw e;
  }
}

export const useOutage = () => useSyncExternalStore(
  (l) => { listeners.add(l); return () => listeners.delete(l); },
  () => outage,
);

/** For tests and "Try again". */
export const resetOutage = () => { failures = 0; set(null); };
