import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const STORE = "ember:scroll";
const positions: Record<string, number> = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) || "{}");
  } catch {
    return {};
  }
})();

/**
 * Newly opened pages start at the top. Going back (to Home, a profile…) returns you to the post
 * you were on, as Facebook does: the spot is put back once the page is tall enough again.
 */
const ScrollToTop = () => {
  const { key, pathname } = useLocation();
  const navigationType = useNavigationType();
  const lastY = useRef(typeof window === "undefined" ? 0 : window.scrollY);
  const shownKey = useRef(key);
  const shownPath = useRef(pathname);

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    const onScroll = () => { lastY.current = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    if (shownKey.current !== key) {
      // Where you were on the page you're leaving (read before this page changed the scroll).
      positions[shownKey.current] = lastY.current;
      const keys = Object.keys(positions);
      if (keys.length > 50) delete positions[keys[0]];
      try {
        sessionStorage.setItem(STORE, JSON.stringify(positions));
      } catch {
        // Private mode: only this visit remembers.
      }
      shownKey.current = key;
    }
    // Only the query changed (a tab, a filter): stay where you are.
    const samePage = shownPath.current === pathname;
    shownPath.current = pathname;
    if (samePage && navigationType !== "POP") return;

    const target = navigationType === "POP" ? positions[key] : 0;
    if (!target) {
      window.scrollTo(0, 0);
      lastY.current = 0;
      return;
    }
    // The page may still be filling in: keep trying until it's tall enough, or you scroll yourself.
    let frame = 0;
    const started = Date.now();
    const stop = () => cancelAnimationFrame(frame);
    const tryRestore = () => {
      window.scrollTo(0, target);
      const done = Math.abs(window.scrollY - target) < 2 || Date.now() - started > 2000;
      if (!done) frame = requestAnimationFrame(tryRestore);
      else stop();
    };
    tryRestore();
    const cancel = () => { stop(); remove(); };
    const remove = () => ["wheel", "touchstart", "keydown"].forEach((e) => window.removeEventListener(e, cancel));
    ["wheel", "touchstart", "keydown"].forEach((e) => window.addEventListener(e, cancel, { passive: true }));
    return cancel;
  }, [key, pathname, navigationType]);

  return null;
};

export default ScrollToTop;
