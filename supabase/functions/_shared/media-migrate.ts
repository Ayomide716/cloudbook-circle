// Moving files uploaded to Supabase Storage (before R2) over to Cloudflare R2, so they're served
// free and kept by phones for a year. Pure helpers here (tested); the work is in media-upload.

/** Every column that holds an uploaded file's address. Arrays are lists of addresses. */
export const MEDIA_COLUMNS: { table: string; columns: string[]; arrays?: string[] }[] = [
  { table: "profiles", columns: ["avatar_url", "cover_url"] },
  { table: "posts", columns: ["image_url", "video_url"], arrays: ["image_urls"] },
  { table: "reels", columns: ["video_url", "thumbnail_url"] },
  { table: "stories", columns: ["media_url"] },
  { table: "messages", columns: ["image_url"] },
  { table: "group_messages", columns: ["image_url"] },
  { table: "group_posts", columns: ["image_url"] },
  { table: "groups", columns: ["image_url"] },
  { table: "album_photos", columns: ["image_url"] },
  { table: "events", columns: ["cover_image"] },
  { table: "pages", columns: ["avatar_url", "cover_url"] },
  { table: "page_posts", columns: ["image_url"] },
  { table: "marketplace_listings", columns: [], arrays: ["image_urls"] },
  { table: "watch_videos", columns: ["video_url", "thumbnail_url"] },
  { table: "ad_campaigns", columns: ["image_url"] },
];

const MARKER = "/storage/v1/object/public/";

/** "…/storage/v1/object/public/post-images/u1/a.webp?x" → "post-images/u1/a.webp"; else null. */
export function storageKey(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const i = url.indexOf(MARKER);
  if (i === -1) return null;
  const key = decodeURIComponent(url.slice(i + MARKER.length).split(/[?#]/)[0]);
  return /^[\w-]+\/.+/.test(key) && !key.includes("..") ? key : null;
}

/** The column's value with moved addresses swapped (a string or a list of them). */
export function swapUrls<T>(value: T, moved: Map<string, string>): T {
  if (typeof value === "string") return (moved.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? moved.get(v) ?? v : v)) as T;
  return value;
}
