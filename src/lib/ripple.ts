/**
 * Android's touch ripple: a soft circle that spreads from your finger over the button or row
 * you press, then fades when you let go. Touch only (a mouse gets hover colours instead).
 *
 * Drawn in a layer laid over the pressed element, clipped to its shape, so nothing about the
 * element itself (its overflow, position or children) has to change.
 */
const PRESSABLE = 'button, a[href], label[for], [role="button"], [role="menuitem"], [role="option"], [role="tab"], [role="switch"], [role="radio"]';
const START_DELAY = 70; // ms: a touch that turns into a scroll within this never ripples
const MOVE_SLOP = 8; // px
const GROW_MS = 380;

function pressable(target: EventTarget | null) {
  const el = (target as Element | null)?.closest?.(PRESSABLE) as HTMLElement | null;
  if (!el || el.closest("[data-no-ripple]")) return null;
  if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") return null;
  const rect = el.getBoundingClientRect();
  // Whole-screen links (a reel, a photo filling the page) don't ripple.
  if (!rect.width || !rect.height || rect.width * rect.height > innerWidth * innerHeight * 0.6) return null;
  return { el, rect };
}

function drawRipple(el: HTMLElement, rect: DOMRect, x: number, y: number) {
  const style = getComputedStyle(el);
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, {
    position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    borderRadius: style.borderRadius, overflow: "hidden", pointerEvents: "none", zIndex: "2147483000", color: style.color,
  });
  const size = 2 * Math.hypot(Math.max(x - rect.left, rect.right - x), Math.max(y - rect.top, rect.bottom - y));
  const circle = document.createElement("div");
  Object.assign(circle.style, {
    position: "absolute", left: `${x - rect.left - size / 2}px`, top: `${y - rect.top - size / 2}px`,
    width: `${size}px`, height: `${size}px`, borderRadius: "50%", background: "currentColor", opacity: "0.12",
  });
  layer.appendChild(circle);
  document.body.appendChild(layer);
  const grow = circle.animate([{ transform: "scale(0.1)" }, { transform: "scale(1)" }], { duration: GROW_MS, easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" });
  return {
    fade(ms: number) {
      // A quick tap lets the circle spread most of the way before fading.
      const left = grow.playState === "running" ? Math.max(0, GROW_MS - Number(grow.currentTime ?? 0)) * 0.5 : 0;
      window.setTimeout(() => {
        circle.animate([{ opacity: 0.12 }, { opacity: 0 }], { duration: ms, easing: "ease-out", fill: "forwards" }).onfinish = () => layer.remove();
      }, left);
    },
  };
}

export function installRipple() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  document.addEventListener(
    "pointerdown",
    (down) => {
      if (down.pointerType !== "touch" || !down.isPrimary) return;
      const hit = pressable(down.target);
      if (!hit) return;
      const x = down.clientX, y = down.clientY;
      let ripple: ReturnType<typeof drawRipple> | null = null;
      const timer = window.setTimeout(() => { ripple = drawRipple(hit.el, hit.rect, x, y); }, START_DELAY);

      const done = () => {
        window.clearTimeout(timer);
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
        window.removeEventListener("pointercancel", cancel, true);
      };
      const up = (e: PointerEvent) => {
        if (e.pointerId !== down.pointerId) return;
        done();
        // A tap quicker than the start delay still gets its ripple.
        (ripple ?? drawRipple(hit.el, hit.rect, x, y)).fade(260);
      };
      const cancel = () => {
        done();
        ripple?.fade(120);
      };
      const move = (e: PointerEvent) => {
        if (e.pointerId === down.pointerId && Math.hypot(e.clientX - x, e.clientY - y) > MOVE_SLOP) cancel();
      };
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
      window.addEventListener("pointercancel", cancel, true);
    },
    { capture: true, passive: true },
  );
}
