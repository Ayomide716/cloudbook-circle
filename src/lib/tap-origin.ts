/**
 * Where the photo you just tapped was on screen, so a full-screen viewer can grow the photo
 * out of that spot (as in native gallery apps) instead of just appearing.
 */
let last: { rect: DOMRect; radius: string; at: number } | null = null;

export function installTapOrigin() {
  document.addEventListener(
    "pointerdown",
    (e) => {
      const target = e.target as Element | null;
      const img = target?.closest("img") ?? target?.closest("button, a, [role=button]")?.querySelector("img");
      if (!img) return;
      last = { rect: img.getBoundingClientRect(), radius: getComputedStyle(img).borderRadius, at: Date.now() };
    },
    { capture: true, passive: true },
  );
}

/** The photo tapped in the last second, once. */
export function takeTapOrigin() {
  const origin = last && Date.now() - last.at < 1000 && last.rect.width > 0 ? last : null;
  last = null;
  return origin;
}
