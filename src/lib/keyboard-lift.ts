/**
 * How far to lift bottom-pinned things (sheets, the chat box) above the keyboard in the app.
 * Android reports the keyboard's height, and may also make the app itself shorter by some or
 * all of it; whatever it already took off mustn't be added again, or the box ends up lifted
 * twice, half off the top of the screen.
 */
export function keyboardLift(keyboardHeight: number, fullHeight: number, currentHeight: number): number {
  if (keyboardHeight <= 0) return 0;
  const shrunk = Math.max(0, fullHeight - currentHeight);
  return Math.max(0, Math.round(keyboardHeight - shrunk));
}

/** The bottom of what you can see: above the keyboard, whichever way the keyboard is handled. */
export function visibleBottom(): number {
  const vv = window.visualViewport;
  const viewportBottom = vv ? vv.height + vv.offsetTop : window.innerHeight;
  const inset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--keyboard-inset")) || 0;
  return Math.min(viewportBottom, window.innerHeight - inset);
}

/** Fired when the keyboard has finished opening, so the focused field can be brought into view. */
export const KEYBOARD_SHOWN_EVENT = "ember:keyboard-shown";
