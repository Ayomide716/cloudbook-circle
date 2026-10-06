import { useRef, useState, type TouchEvent } from "react";

/** How far (px) a message must be pulled before letting go replies to it. */
export const SWIPE_REPLY_THRESHOLD = 56;
const MAX_PULL = 80;

/**
 * WhatsApp's swipe-to-reply: drag a message to the right and let go to reply to it.
 * Only a clearly sideways drag counts, so scrolling the chat up and down is unaffected.
 * Returns how far the message is pulled (to move it with the finger) and the touch handlers.
 */
export function useSwipeToReply(onReply: () => void) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const direction = useRef<"undecided" | "sideways" | "vertical">("undecided");
  const armed = useRef(false);

  const reset = () => {
    start.current = null;
    direction.current = "undecided";
    armed.current = false;
    setOffset(0);
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    direction.current = "undecided";
    armed.current = false;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!start.current || direction.current === "vertical") return;
    const dx = e.touches[0].clientX - start.current.x;
    const dy = e.touches[0].clientY - start.current.y;
    if (direction.current === "undecided") {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      direction.current = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.2 ? "sideways" : "vertical";
      if (direction.current === "vertical") return;
    }
    // Follows the finger, slowing down past the threshold.
    const pull = dx <= 0 ? 0 : dx < SWIPE_REPLY_THRESHOLD ? dx : Math.min(MAX_PULL, SWIPE_REPLY_THRESHOLD + (dx - SWIPE_REPLY_THRESHOLD) * 0.35);
    setOffset(pull);
    // A tiny buzz the moment letting go would reply, as on WhatsApp.
    if (pull >= SWIPE_REPLY_THRESHOLD && !armed.current) {
      armed.current = true;
      try { navigator.vibrate?.(10); } catch { /* not supported */ }
    } else if (pull < SWIPE_REPLY_THRESHOLD) {
      armed.current = false;
    }
  };

  const onTouchEnd = () => {
    const reply = direction.current === "sideways" && armed.current;
    reset();
    if (reply) onReply();
  };

  return {
    offset,
    swiping: offset > 0,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: reset },
  };
}
