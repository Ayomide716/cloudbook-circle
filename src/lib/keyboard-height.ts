import { useEffect, useState } from "react";

/**
 * The phone keyboard's height, remembered, so a panel shown in its place (emoji, attach) is
 * exactly as tall and the chat above doesn't jump when you switch, as in WhatsApp.
 *
 * Whether it's up comes from body.keyboard-shown, and its height from --keyboard-height, which
 * the app (lib/native) and the website (use-keyboard-inset) keep. Not --keyboard-inset: when
 * Android makes the app shorter for the keyboard that is 0 while the keyboard is up.
 */
const KEY = "ember:keyboard-height";
const DEFAULT = 300;

const readHeight = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--keyboard-height")) || 0;
// Really taking room (lib/native, use-keyboard-inset), not just a field being tapped.
const readOpen = () => document.body.classList.contains("keyboard-shown");

export function rememberedKeyboardHeight() {
  try {
    const n = Number(localStorage.getItem(KEY));
    if (n >= 180 && n <= 520) return n;
  } catch { /* blocked */ }
  return DEFAULT;
}

/** Whether the keyboard is up, and the panel height to use (the keyboard's last height). */
export function useKeyboard() {
  const [open, setOpen] = useState(() => (typeof document === "undefined" ? false : readOpen()));
  const [height, setHeight] = useState(rememberedKeyboardHeight);
  useEffect(() => {
    const update = () => {
      setOpen(readOpen());
      const now = readHeight();
      if (now >= 180 && now <= 520) {
        setHeight(now);
        try { localStorage.setItem(KEY, String(Math.round(now))); } catch { /* blocked */ }
      }
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", update);
    update();
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, []);
  return { open, height };
}
