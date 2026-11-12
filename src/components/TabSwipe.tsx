import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { haptic } from "@/lib/haptics";

/** The main tabs, in the tab bar's order. Reels and Chats have their own swipes, so they're only ever targets. */
const SWIPE_TABS = ["/", "/reels", "/messages", "/menu"];
const EDGE = 28; // px: swipes from the very edge are Android's (and EdgeSwipeBack's)

/** Something under the finger that scrolls sideways itself (chips, stories, carousels). */
function scrollsSideways(el: Element | null): boolean {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    if (n.closest("[data-no-tab-swipe], input, textarea, [role=slider], [role=dialog], [contenteditable=true]")) return true;
    const style = getComputedStyle(n);
    if ((style.overflowX === "auto" || style.overflowX === "scroll") && n.scrollWidth > n.clientWidth + 2) return true;
  }
  return false;
}

/**
 * Swipe left or right on a main tab to go to the next or previous one, as in Facebook's app.
 * Phones only (touch); scrolling down a page never counts.
 */
const TabSwipe = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const index = SWIPE_TABS.indexOf(pathname);
    if (index < 0 || pathname === "/reels" || pathname === "/messages") return;
    let start: { x: number; y: number; t: number } | null = null;
    const down = (e: TouchEvent) => {
      const t = e.touches[0];
      if (e.touches.length !== 1 || t.clientX < EDGE || t.clientX > innerWidth - EDGE || scrollsSideways(e.target as Element)) { start = null; return; }
      start = { x: t.clientX, y: t.clientY, t: Date.now() };
    };
    const up = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x, dy = t.clientY - start.y;
      const speed = Math.abs(dx) / Math.max(1, Date.now() - start.t);
      start = null;
      // Clearly sideways, and far or fast enough.
      if (Math.abs(dy) > Math.abs(dx) * 0.5 || (Math.abs(dx) < 90 && !(Math.abs(dx) > 50 && speed > 0.5))) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [data-vaul-drawer][data-state="open"]')) return;
      const next = SWIPE_TABS[index + (dx < 0 ? 1 : -1)];
      if (!next) return;
      haptic(8);
      navigate(next, { state: { tabSwipe: dx < 0 ? "next" : "prev" } });
    };
    const cancel = () => { start = null; };
    document.addEventListener("touchstart", down, { passive: true });
    document.addEventListener("touchend", up, { passive: true });
    document.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", down);
      document.removeEventListener("touchend", up);
      document.removeEventListener("touchcancel", cancel);
    };
  }, [pathname, navigate]);

  return null;
};

export default TabSwipe;
