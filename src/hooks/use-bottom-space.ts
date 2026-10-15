import { useEffect, type RefObject } from "react";

/**
 * Tells toasts (and other things pinned to the bottom) how much room something at the bottom of
 * the screen takes, through a CSS variable on <html>, while it's showing.
 * Pass a size (e.g. "4.75rem") or an element to measure.
 */
export function useBottomSpace(name: "--dock-space" | "--posting-space" | "--offline-space", size: string | RefObject<HTMLElement | null> | null) {
  useEffect(() => {
    const root = document.documentElement.style;
    if (!size) return;
    if (typeof size === "string") {
      root.setProperty(name, size);
      return () => root.removeProperty(name);
    }
    const el = size.current;
    if (!el) return;
    const set = () => root.setProperty(name, `${el.offsetHeight + 8}px`);
    set();
    const observer = new ResizeObserver(set);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.removeProperty(name);
    };
  }, [name, size]);
}
