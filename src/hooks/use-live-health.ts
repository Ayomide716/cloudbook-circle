import { useCallback, useRef, useState } from "react";

/**
 * Watches a live (realtime) channel. When it fails or drops (CHANNEL_ERROR, TIMED_OUT, CLOSED),
 * `live` turns false, so the screen can check for news more often, and `attempt` goes up after a
 * short wait (3s, 6s, 12s… up to 30s), which the screen uses to set the channel up again.
 *
 * Usage: put `attempt` in the effect that creates the channel; in that effect call
 * `const w = watch()`, pass `w.onStatus` to `.subscribe()`, and call `w.stop()` in its cleanup.
 */
export function useLiveHealth() {
  const [live, setLive] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const failures = useRef(0);

  const watch = useCallback(() => {
    let disposed = false;
    let timer: number | undefined;
    const onStatus = (status: string) => {
      if (disposed) return;
      if (status === "SUBSCRIBED") {
        failures.current = 0;
        setLive(true);
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setLive(false);
        window.clearTimeout(timer);
        const wait = Math.min(3000 * 2 ** failures.current, 30000);
        failures.current += 1;
        timer = window.setTimeout(() => { if (!disposed) setAttempt((n) => n + 1); }, wait);
      }
    };
    const stop = () => { disposed = true; window.clearTimeout(timer); };
    return { onStatus, stop };
  }, []);

  return { live, attempt, watch };
}
