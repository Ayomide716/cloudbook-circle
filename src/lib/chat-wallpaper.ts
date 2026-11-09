import { useEffect, useState } from "react";
import { uploadMedia } from "@/lib/media-upload";
import { shrinkImage } from "@/lib/image-compress";

/**
 * Your own photo behind a chat, as on WhatsApp: for one chat, or for all of them. Kept on this
 * phone (per account), like WhatsApp's; the photo itself is uploaded so it loads fast anywhere.
 * `dim` (0 to 0.7) darkens it so messages stay easy to read.
 */
export interface Wallpaper { url: string; dim: number }
interface Stored { all?: Wallpaper; chats: Record<string, Wallpaper> }

/** "all", or a chat: the other person's id, or "g:<group id>". */
export type WallpaperKey = string;
const EVENT = "ember:wallpaper";
const storageKey = (userId: string) => `ember:wallpapers:${userId}`;

function read(userId: string | null | undefined): Stored {
  if (!userId) return { chats: {} };
  try {
    const s = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "null") as Stored | null;
    return { all: s?.all, chats: s?.chats && typeof s.chats === "object" ? s.chats : {} };
  } catch {
    return { chats: {} };
  }
}

/** The wallpaper a chat shows: its own, else the one for all chats, else none. */
export function wallpaperFor(userId: string | null | undefined, key: WallpaperKey): Wallpaper | null {
  const s = read(userId);
  return (key === "all" ? s.all : s.chats[key] ?? s.all) ?? null;
}

/** Whether a chat has its own wallpaper (not just the one for all chats). */
export const hasOwnWallpaper = (userId: string | null | undefined, key: WallpaperKey) => key !== "all" && !!read(userId).chats[key];

export function setWallpaper(userId: string, key: WallpaperKey, wallpaper: Wallpaper | null) {
  const s = read(userId);
  if (key === "all") s.all = wallpaper ?? undefined;
  else if (wallpaper) s.chats[key] = wallpaper;
  else delete s.chats[key];
  try { localStorage.setItem(storageKey(userId), JSON.stringify(s)); } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(EVENT));
}

export function useWallpaper(userId: string | null | undefined, key: WallpaperKey): Wallpaper | null {
  const [w, setW] = useState(() => wallpaperFor(userId, key));
  useEffect(() => {
    const update = () => setW(wallpaperFor(userId, key));
    update();
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    return () => { window.removeEventListener(EVENT, update); window.removeEventListener("storage", update); };
  }, [userId, key]);
  return w;
}

/** Makes the photo a sensible size (sharp on a phone, quick to load) and uploads it. */
export async function uploadWallpaper(userId: string, file: File): Promise<string> {
  const small = await shrinkImage(file, 1600, 0.82);
  return uploadMedia("chat-images", `${userId}/wallpaper-${Date.now()}.${small.name.split(".").pop() || "jpg"}`, small);
}
