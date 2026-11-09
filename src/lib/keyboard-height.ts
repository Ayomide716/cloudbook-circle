import { useEffect, useState } from "react";

/**
 * The phone keyboard's height, remembered, so a panel shown in its place (emoji, attach) is
 * exactly as tall and the chat above doesn't jump when you switch, as in WhatsApp. It comes
 * from --keyboard-inset, which the app (lib/native) and the website (use-keyboard-inset) keep.
 */
const KEY = "ember:keyboard-height";
const DEFAULT = 300;

const readInset = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--keyboard-inset")) || 0;

export function rememberedKeyboardHeight() {
  try {
    const n = Number(localStorage.getItem(KEY));
    if (n >= 180 && n <= 520) return n;
  } catch { /* blocked */ }
  return DEFAULT;
}

/** Whether the keyboard is up, and the panel height to use (the keyboard's last height). */
export function useKeyboard() {
  const [inset, setInset] = useState(() => (typeof document === "undefined" ? 0 : readInset()));
  const [height, setHeight] = useState(rememberedKeyboardHeight);
  useEffect(() => {
    const update = () => {
      const now = readInset();
      setInset(now);
      if (now >= 180 && now <= 520) {
        setHeight(now);
        try { localStorage.setItem(KEY, String(Math.round(now))); } catch { /* blocked */ }
      }
    };
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    window.addEventListener("resize", update);
    update();
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, []);
  return { open: inset > 80, height };
}
