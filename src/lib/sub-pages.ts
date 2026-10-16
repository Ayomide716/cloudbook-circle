/**
 * Pages you open from somewhere (the menu, a post, a chat) rather than a tab. On phones they
 * show only their own header with a back arrow, as on Facebook, not the ember bar above it.
 */
const SUB_PAGES = ["/messages", "/explore", "/settings", "/saved", "/story-archive", "/offline-videos", "/admin", "/events", "/marketplace", "/watch", "/pages", "/ads"];

export function isSubPage(pathname: string): boolean {
  if (SUB_PAGES.includes(pathname)) return true;
  // A single post, and a group's own page (its cover has the back button).
  return pathname.startsWith("/post/") || /^\/groups\/[^/]+$/.test(pathname);
}
