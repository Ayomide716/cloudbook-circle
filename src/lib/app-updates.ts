/**
 * Picks up new versions quickly. An installed app that's brought back from the background
 * keeps running the code it started with, so new releases used to appear only after the
 * app was fully closed. Now, whenever the app comes back to the foreground (and every
 * 10 minutes), it checks whether a newer version is live and switches to it, but never
 * while you're typing.
 */

/** The app's main script in a page's HTML, e.g. "/assets/index-AbC123.js". */
export function mainScriptOf(html: string): string | null {
  return html.match(/<script[^>]+type="module"[^>]+src="(\/assets\/[^"]+\.js)"/)?.[1]
    ?? html.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"[^>]+type="module"/)?.[1]
    ?? null;
}

const isTyping = () => {
  const el = document.activeElement;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);
};

export function watchForUpdates() {
  const running = mainScriptOf(document.documentElement.outerHTML);
  if (!running) return; // development server: nothing to compare

  let updateReady = false;
  const check = async () => {
    try {
      const res = await fetch(`/?check=${Date.now()}`, { cache: "no-store" });
      const live = mainScriptOf(await res.text());
      if (live && live !== running) updateReady = true;
    } catch { /* offline: try again later */ }
    if (updateReady && document.visibilityState === "visible" && !isTyping()) window.location.reload();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  setInterval(check, 10 * 60_000);
}
