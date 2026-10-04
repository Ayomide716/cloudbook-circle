import { useEffect } from "react";

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

    const update = () => {
      const inset = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
      root.style.setProperty("--keyboard-inset", `${inset}px`);
      const typing = coarse.matches && isEditable(document.activeElement);
      document.body.classList.toggle("keyboard-open", typing || inset > 80);
    };

    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    const onFocusIn = (e: FocusEvent) => {
      update();
      const target = e.target as Element | null;
      if (!coarse.matches || !isEditable(target)) return;
      // Wait for the keyboard animation, then make sure the field isn't hidden behind it.
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const rect = target.getBoundingClientRect();
        const visibleBottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
        if (rect.bottom > visibleBottom - 8 || rect.top < 0) target.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 350);
    };
    const onFocusOut = () => setTimeout(update, 50);

    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      clearTimeout(scrollTimer);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      root.style.removeProperty("--keyboard-inset");
      document.body.classList.remove("keyboard-open");
    };
  }, []);
}
