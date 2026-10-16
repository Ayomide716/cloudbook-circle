import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "@/components/icons";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const EDGE = 24; // px from the left edge where the swipe can start
const TRIGGER = 80; // px of pull that means "go back"

/** iPhone Safari (in a tab) has its own swipe-back; doubling it would go back twice. */
const browserHasOwnSwipe = () => {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
};

/**
 * Swipe in from the left edge to go back, as in native apps: a round arrow follows your thumb
 * and grows; let go past the mark and the app goes back (the page slides in from the left).
 */
const EdgeSwipeBack = () => {
  const navigate = useNavigate();
  const [pull, setPull] = useState<{ x: number; y: number } | null>(null);
  const start = useRef<{ x: number; y: number; decided: boolean; horizontal: boolean } | null>(null);
  const armed = useRef(false);

  useEffect(() => {
    if (browserHasOwnSwipe()) return;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || t.clientX > EDGE) return;
      // Somewhere to go back to, and nothing open on top (a sheet, dialog or viewer).
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (idx < 1 || document.querySelector('[role="dialog"], [vaul-drawer]')) return;
      start.current = { x: t.clientX, y: t.clientY, decided: false, horizontal: false };
      armed.current = false;
      // Listen to the finger only for this touch, so ordinary scrolling never waits on us.
      document.addEventListener("touchmove", onMove, { passive: false });
    };

    const onMove = (e: TouchEvent) => {
      const s = start.current;
      if (!s) return;
      const t = e.touches[0];
      const dx = t.clientX - s.x;
      const dy = t.clientY - s.y;
      if (!s.decided && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        s.decided = true;
        s.horizontal = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.2;
        if (!s.horizontal) { start.current = null; document.removeEventListener("touchmove", onMove); return; }
      }
      if (!s.horizontal) return;
      if (e.cancelable) e.preventDefault(); // don't scroll the page while pulling
      const x = Math.max(0, Math.min(dx, 140));
      const nowArmed = x >= TRIGGER;
      if (nowArmed && !armed.current) haptic(8);
      armed.current = nowArmed;
      setPull({ x, y: t.clientY });
    };

    const onEnd = () => {
      document.removeEventListener("touchmove", onMove);
      const s = start.current;
      start.current = null;
      setPull(null);
      if (s?.horizontal && armed.current) navigate(-1);
      armed.current = false;
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [navigate]);

  if (!pull) return null;
  const progress = Math.min(1, pull.x / TRIGGER);
  const ready = pull.x >= TRIGGER;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed left-0 z-[100] flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors",
        ready ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"
      )}
      style={{
        top: pull.y - 22,
        transform: `translateX(${Math.min(pull.x, 120) * 0.55 - 8}px) scale(${0.6 + progress * 0.4})`,
        opacity: 0.35 + progress * 0.65,
      }}
    >
      <ChevronLeft className="h-6 w-6" />
    </div>
  );
};

export default EdgeSwipeBack;
