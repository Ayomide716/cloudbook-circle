import { useEffect, useState } from "react";

/**
 * True while the page is being scrolled down (past the first `offset` pixels), false as soon as
 * it scrolls back up: the top bar slides away to give the feed more room, as in Facebook's app.
 */
export function useHideOnScroll(enabled: boolean, offset = 56) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - last;
        // Small wobbles (momentum, rubber-banding) don't toggle the bar.
        if (Math.abs(delta) < 6) return;
        setHidden(delta > 0 && y > offset);
        last = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [enabled, offset]);

  return hidden;
}
