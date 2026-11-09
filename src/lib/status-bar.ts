import { useEffect } from "react";

/**
 * Full-screen dark places (Reels, stories, the photo viewer, calls) want a black status bar
 * with light icons, whatever the app's theme, as in Instagram and Facebook. Each one that's
 * on screen holds a claim; the bars go back to the theme when the last one lets go.
 */
let claims = 0;
const listeners = new Set<() => void>();

export const statusBarForcedDark = () => claims > 0;

export function onStatusBarChange(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function claimDarkStatusBar() {
  claims++;
  listeners.forEach((fn) => fn());
  let released = false;
  return () => {
    if (released) return;
    released = true;
    claims--;
    listeners.forEach((fn) => fn());
  };
}

/** Black status bar with light icons while `active`. */
export function useDarkStatusBar(active = true) {
  useEffect(() => (active ? claimDarkStatusBar() : undefined), [active]);
}
