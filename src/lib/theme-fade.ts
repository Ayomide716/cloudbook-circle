/**
 * Switch between light and dark with a short cross-fade of the colours, instead of the whole
 * screen flipping at once. Skipped for people who ask for less motion.
 */
export function fadeTheme(change: () => void) {
  const root = document.documentElement;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return change();
  root.classList.add("theme-fade");
  change();
  window.clearTimeout(Number(root.dataset.themeFadeTimer));
  root.dataset.themeFadeTimer = String(window.setTimeout(() => root.classList.remove("theme-fade"), 450));
}
