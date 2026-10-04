/**
 * Turns what someone typed as a website into a safe link, or null.
 * Only http(s) is allowed, so a "javascript:" address can't run code when clicked,
 * and "example.com" becomes "https://example.com" instead of a broken relative link.
 */
export function safeWebsiteUrl(input: string | null | undefined): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** The address without "https://" and trailing slash, for display. */
export const displayUrl = (href: string) => href.replace(/^https?:\/\//, "").replace(/\/$/, "");
