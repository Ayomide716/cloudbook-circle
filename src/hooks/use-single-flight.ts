import { useRef } from "react";

/**
 * For Post, Send, Upload…: while the first tap is still saving, more taps do nothing, so a slow
 * network can't turn impatient tapping into two reels or the same comment three times.
 * (The button's own disabled state only applies after React re-renders, which a quick second
 * tap can beat.) Form events are still prevented, so an ignored tap never reloads the page.
 *
 *   const once = useSingleFlight();
 *   const handlePost = once(async (e: React.FormEvent) => { ... });
 */
export function useSingleFlight() {
  const busy = useRef(false);
  return <A extends unknown[]>(fn: (...args: A) => unknown) =>
    async (...args: A): Promise<void> => {
      const first = args[0] as { preventDefault?: unknown } | undefined;
      if (first && typeof first === "object" && typeof first.preventDefault === "function") {
        (first as { preventDefault: () => void }).preventDefault();
      }
      if (busy.current) return;
      busy.current = true;
      try {
        await fn(...args);
      } finally {
        busy.current = false;
      }
    };
}

/**
 * For chat, where several quick messages in a row are normal: only the exact same message sent
 * again within a moment is treated as a double tap.
 */
export function isRepeatSend(last: { text: string; at: number } | null, text: string, now = Date.now(), windowMs = 1500) {
  return !!last && last.text === text && now - last.at < windowMs;
}
