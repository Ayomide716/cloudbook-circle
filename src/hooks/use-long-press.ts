import { useRef, type MouseEvent, type PointerEvent } from "react";
import { haptic } from "@/lib/haptics";

/**
 * Press and hold (touch) or right-click (mouse) to open something, as WhatsApp's message menu.
 * Moving the finger (scrolling, swiping to reply) cancels it. `fired` says the press just
 * opened it, so the tap that ends the press can be ignored.
 */
export function useLongPress(onLongPress: () => void, ms = 420) {
  const timer = useRef<number>();
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = () => {
    window.clearTimeout(timer.current);
    start.current = null;
  };

  return {
    fired,
    handlers: {
      onPointerDown: (e: PointerEvent) => {
        if (e.pointerType === "mouse") return;
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          fired.current = true;
          start.current = null;
          haptic(15);
          onLongPress();
        }, ms);
      },
      onPointerMove: (e: PointerEvent) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
      },
      onPointerUp: clear,
      onPointerCancel: clear,
      onContextMenu: (e: MouseEvent) => {
        e.preventDefault();
        // Android also sends a context menu after a long press: it's already open.
        if (fired.current) return;
        onLongPress();
      },
    },
  };
}
