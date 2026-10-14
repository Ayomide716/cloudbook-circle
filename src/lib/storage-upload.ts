import { LONG_CACHE } from "@/lib/image-compress";
import { supabase } from "@/integrations/supabase/client";

/**
 * Uploads a file to Supabase Storage with real progress (supabase-js has no progress events).
 * Resolves with the file's public URL.
 */
export async function uploadWithProgress(
  bucket: string,
  path: string,
  file: Blob,
  onProgress?: (percent: number) => void
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in again.");
  const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("apikey", import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    // Kept by phones for a year: the file never changes, so it's downloaded once per viewer.
    xhr.setRequestHeader("cache-control", `max-age=${LONG_CACHE}`);
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
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

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** The storage path of a public URL from `bucket`, for deleting the file later. */
export function storagePathFromUrl(bucket: string, publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = publicUrl.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(publicUrl.slice(i + marker.length));
}

/** Duration (seconds) and a JPEG frame from a local video file, read in the browser. */
export function readVideoInfo(file: File): Promise<{ duration: number | null; thumbnail: Blob | null }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const src = URL.createObjectURL(file);
    let duration: number | null = null;
    const done = (thumbnail: Blob | null) => {
      URL.revokeObjectURL(src);
      resolve({ duration, thumbnail });
    };
    const timeout = setTimeout(() => done(null), 8000);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      duration = Number.isFinite(video.duration) ? Math.round(video.duration) : null;
      // A frame a little way in is more representative than the (often black) first one.
      video.currentTime = Math.min(1, (video.duration || 2) / 2);
    };
    video.onseeked = () => {
      clearTimeout(timeout);
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 640 / (video.videoWidth || 640));
      canvas.width = Math.round((video.videoWidth || 640) * scale);
      canvas.height = Math.round((video.videoHeight || 360) * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx || !video.videoWidth) return done(null);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => done(blob), "image/jpeg", 0.8);
    };
    video.onerror = () => {
      clearTimeout(timeout);
      done(null);
    };
    video.src = src;
  });
}
