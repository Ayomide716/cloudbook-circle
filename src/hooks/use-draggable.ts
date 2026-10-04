import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

const MARGIN = 8;

/**
 * Lets a fixed-position element be dragged around the screen with a mouse or finger.
 * Until it's moved, the element keeps the position from its CSS classes. Presses that
 * start on a button aren't drags, and a short press doesn't count as one either, so
 * the element can still be tapped (check `wasDragged()` in its click handler).
 */
export function useDraggable<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ id: number; dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null);
  const movedRef = useRef(false);

  const clamp = useCallback((x: number, y: number) => {
    const el = ref.current;
    const w = el?.offsetWidth ?? 0;
    const h = el?.offsetHeight ?? 0;
    return {
      x: Math.min(Math.max(MARGIN, x), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
      y: Math.min(Math.max(MARGIN, y), Math.max(MARGIN, window.innerHeight - h - MARGIN)),
    };
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest("button, a, input, [role=slider]")) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    drag.current = { id: e.pointerId, dx: e.clientX - rect.left, dy: e.clientY - rect.top, startX: e.clientX, startY: e.clientY, moved: false };
    movedRef.current = false;
    el.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 6) return;
    d.moved = true;
    movedRef.current = true;
    setPos(clamp(e.clientX - d.dx, e.clientY - d.dy));
  }, [clamp]);

  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    ref.current?.releasePointerCapture?.(e.pointerId);
  }, []);

  // Stay on screen when the window is resized or the phone rotates.
  useEffect(() => {
    if (!pos) return;
    const onResize = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos, clamp]);

  const reset = useCallback(() => setPos(null), []);

  return {
    ref,
    /** Spread onto the element: inline position once it has been moved. */
    style: pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    /** True if the last press moved the element (so its click should be ignored). */
    wasDragged: () => movedRef.current,
    reset,
  };
}
