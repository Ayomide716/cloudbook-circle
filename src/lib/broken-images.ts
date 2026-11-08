/**
 * Photos that fail to load (a weak connection, a file that's gone) show a soft grey placeholder
 * with a picture icon instead of the browser's broken-image mark. Tapping it tries once more.
 * One listener for the whole app; an image can opt out with data-no-fallback.
 */
const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e7e7e4"/><g transform="translate(176 126)" fill="none" stroke="#9a9a96" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="44" height="36" rx="7"/><circle cx="16" cy="15" r="4"/><path d="M4 34l13-12 9 8 7-6 13 10"/></g></svg>`
  );

export function installBrokenImageFallback() {
  document.addEventListener(
    "error",
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || img.dataset.noFallback !== undefined) return;
      if (img.src === PLACEHOLDER || img.dataset.broken) return;
      img.dataset.broken = img.currentSrc || img.src;
      img.removeAttribute("srcset");
      img.src = PLACEHOLDER;
      img.title = "Couldn't load. Tap to try again";
    },
    true
  );
  document.addEventListener(
    "click",
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.dataset.broken) return;
      e.preventDefault();
      e.stopPropagation();
      const original = img.dataset.broken;
      delete img.dataset.broken;
      img.removeAttribute("title");
      img.src = original;
    },
    true
  );
}
