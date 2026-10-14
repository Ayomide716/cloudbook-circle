import { uploadMedia, type MediaFolder } from "@/lib/media-upload";

/** Uploads a file (to Cloudflare R2 when set up, else Supabase Storage) and resolves with its public URL. */
export function uploadWithProgress(bucket: string, path: string, file: Blob, onProgress?: (percent: number) => void): Promise<string> {
  return uploadMedia(bucket as MediaFolder, path, file, onProgress);
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
