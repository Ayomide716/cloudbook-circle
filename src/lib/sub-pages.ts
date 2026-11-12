/**
 * Pages with their own header on phones, so no "ember." bar above it. Only Home keeps that bar.
 * Most are opened from somewhere (the menu, the bell, a post) and their header has a back
 * arrow; Chats and Menu are tabs, and their header is just the title.
 */
const SUB_PAGES = ["/messages", "/menu", "/friends", "/groups", "/notifications", "/explore", "/settings", "/saved", "/story-archive", "/offline-videos", "/admin", "/events", "/marketplace", "/watch", "/pages", "/ads"];

export function isSubPage(pathname: string): boolean {
  if (SUB_PAGES.includes(pathname)) return true;
  // A single post, and a group's own page (its cover has the back button).
  return pathname.startsWith("/post/") || /^\/groups\/[^/]+$/.test(pathname);
}
