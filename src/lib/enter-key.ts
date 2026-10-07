import { useLayoutEffect, type KeyboardEvent, type RefObject } from "react";

/**
 * Enter in message and comment boxes, as in WhatsApp: on phones Enter starts a new line (you
 * send with the button); with a keyboard, Enter sends and Shift+Enter starts a new line.
 */
export function enterMakesNewLine(): boolean {
  try {
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  } catch {
    return false;
  }
}

export function sendOnEnter(e: KeyboardEvent<HTMLTextAreaElement>) {
  // Never mid-composition on keyboards that build characters (Chinese, Japanese, …).
  if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || enterMakesNewLine()) return;
  e.preventDefault();
  e.currentTarget.form?.requestSubmit();
}

/** Grows a text box with its text, up to `maxHeight` pixels, then it scrolls. */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement>, value: string, maxHeight = 140) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [ref, value, maxHeight]);
}
