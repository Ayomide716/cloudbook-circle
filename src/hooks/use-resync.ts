import { useEffect, useRef } from "react";

/**
 * Catches up after the app has been away: phones pause background tabs and drop the live
 * connection, so anything that arrived meanwhile would only show after a reload. Runs `sync`
 * when the app comes back on screen or back online and, if `everyMs` is given, every so often
 * while it's on screen (a safety net for a live connection that quietly stopped).
 */
export function useResync(sync: () => void, everyMs?: number, enabled = true) {
  const syncRef = useRef(sync);
  syncRef.current = sync;

  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const run = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < 1500) return;
      last = now;
      syncRef.current();
    };
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", run);
    window.addEventListener("pageshow", run);
    const timer = everyMs ? window.setInterval(run, everyMs) : undefined;
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", run);
      window.removeEventListener("pageshow", run);
      window.clearInterval(timer);
    };
  }, [everyMs, enabled]);
}
