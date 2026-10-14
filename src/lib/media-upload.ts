/**
 * Every photo, video and voice note goes up through here.
 *
 * When Cloudflare R2 is set up (the media-upload function's secrets, docs/cloudflare-r2.md),
 * files go straight to R2, where downloads are free. Until then, or if R2 can't be reached,
 * they go to Supabase Storage exactly as before, so uploading never breaks.
 */
import { supabase } from "@/integrations/supabase/client";
import { LONG_CACHE } from "./image-compress";

export type MediaFolder =
  | "post-images"
  | "post-videos"
  | "avatars"
  | "chat-images"
  | "voice-messages"
  | "marketplace"
  | "page-images"
  | "watch-videos";

interface Ticket {
  uploadUrl: string;
  headers: Record<string, string>;
  publicUrl: string;
}

// After R2 says it isn't set up, don't ask again for a while (one less request per upload).
let r2OffUntil = 0;

async function r2Ticket(folder: MediaFolder, file: Blob, ext: string): Promise<Ticket | null> {
  if (Date.now() < r2OffUntil) return null;
  try {
    const { data, error } = await supabase.functions.invoke<Ticket>("media-upload", {
      // "audio/webm;codecs=opus" → "audio/webm": the upload link is signed for the plain type.
      body: { folder, contentType: (file.type || "application/octet-stream").split(";")[0].trim(), size: file.size, ext },
    });
    if (error || !data?.uploadUrl) {
      // 503 "not-configured" (or the function isn't deployed yet): Supabase Storage for now.
      const status = (error as { context?: { status?: number } } | null)?.context?.status;
      if (!status || status === 503 || status === 404) r2OffUntil = Date.now() + 10 * 60_000;
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function put(url: string, file: Blob, headers: Record<string, string>, method: "PUT" | "POST", onProgress?: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Upload failed (${xhr.status})`;
      try {
        message = JSON.parse(xhr.responseText).message || message;
      } catch {
        // Keep the generic message.
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading."));
    xhr.send(file);
  });
}

/** The extension for a file name: from its name, else its type. */
export function extensionOf(file: Blob & { name?: string }): string {
  const fromName = file.name?.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName) && fromName !== file.name?.toLowerCase()) return fromName;
  const fromType = file.type.split("/")[1]?.split(";")[0]?.replace(/[^a-z0-9]/g, "").slice(0, 5);
  return fromType || "bin";
}

/**
 * Uploads `file` and resolves with its public address. `path` is where it goes in Supabase
 * Storage (R2 picks its own name under the uploader's id).
 */
export async function uploadMedia(
  folder: MediaFolder,
  path: string,
  file: Blob & { name?: string },
  onProgress?: (percent: number) => void,
): Promise<string> {
  const ticket = await r2Ticket(folder, file, extensionOf(file));
  if (ticket) {
    try {
      await put(ticket.uploadUrl, file, ticket.headers, "PUT", onProgress);
      return ticket.publicUrl;
    } catch {
      // R2 unreachable from here (e.g. its CORS isn't set up yet): Supabase Storage instead.
      r2OffUntil = Date.now() + 10 * 60_000;
    }
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${folder}/${path.split("/").map(encodeURIComponent).join("/")}`;
  await put(
    url,
    file,
    {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "x-upsert": "false",
      // Kept by phones for a year: the file never changes, so it's downloaded once per viewer.
      "cache-control": `max-age=${LONG_CACHE}`,
      ...(file.type ? { "Content-Type": file.type } : {}),
    },
    "POST",
    onProgress,
  );
  return supabase.storage.from(folder).getPublicUrl(path).data.publicUrl;
}
