import { useEffect } from "react";
import { isNative } from "@/lib/native/platform";
import { KEYBOARD_SHOWN_EVENT, visibleBottom } from "@/lib/keyboard-lift";

const isEditable = (el: Element | null): el is HTMLElement =>
  !!el &&
  (el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && !["button", "checkbox", "radio", "file", "range", "submit", "color"].includes(el.type)) ||
    (el instanceof HTMLElement && el.isContentEditable));

/**
 * Keeps inputs visible above the on-screen keyboard.
 *
 * - Sets `--keyboard-inset` on <html> to the height the keyboard covers (iOS Safari overlays the
 *   keyboard instead of resizing the page), so bottom-pinned UI can sit above it.
 * - Adds `keyboard-open` to <body> while typing on a touch device, which hides the floating dock.
 * - Scrolls the focused field into view once the keyboard has opened.
 *
 * Android Chrome resizes the page itself thanks to `interactive-widget=resizes-content` in index.html.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    const coarse = window.matchMedia("(pointer: coarse)");
    const root = document.documentElement;

    // The page's height with no keyboard: Android Chrome makes the page shorter instead of
    // covering it, so the keyboard's height is how much shorter it got.
    let fullHeight = window.innerHeight;
    const update = () => {
      // The Android app gets the keyboard's height from Android itself (lib/native).
      if (isNative) return;
      const inset = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
      root.style.setProperty("--keyboard-inset", `${inset}px`);
      if (!isEditable(document.activeElement) || window.innerHeight > fullHeight) fullHeight = window.innerHeight;
      root.style.setProperty("--keyboard-height", `${Math.max(inset, fullHeight - window.innerHeight)}px`);
      const typing = coarse.matches && isEditable(document.activeElement);
      document.body.classList.toggle("keyboard-open", typing || inset > 80);
    };

    // Make sure the field you're typing in isn't behind the keyboard (or pushed off the top).
    const reveal = (target: Element | null) => {
      if (!target || !isEditable(target) || !target.isConnected) return;
      const rect = target.getBoundingClientRect();
      const bottom = visibleBottom();
      if (rect.bottom > bottom - 8 || rect.top < 0) target.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    const onFocusIn = (e: FocusEvent) => {
      update();
      const target = e.target as Element | null;
      if (!coarse.matches || !isEditable(target)) return;
      // Wait for the keyboard animation, then check (the app also checks when it's fully open).
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => reveal(target), 350);
    };
    const onKeyboardShown = () => reveal(document.activeElement);
    const onFocusOut = () => setTimeout(update, 50);

    update();
    vv?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener(KEYBOARD_SHOWN_EVENT, onKeyboardShown);
    return () => {
      window.removeEventListener(KEYBOARD_SHOWN_EVENT, onKeyboardShown);
      clearTimeout(scrollTimer);
      vv?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      root.style.removeProperty("--keyboard-inset");
      root.style.removeProperty("--keyboard-height");
      document.body.classList.remove("keyboard-open");
    };
  }, []);
}
