/**
 * Photos are shrunk on the phone before they're uploaded. A camera photo is 3–8 MB, and every
 * view downloads it again from Supabase, which counts against the storage traffic allowance
 * ("cached egress"). Resized to what a screen can show and saved as WebP, the same photo is
 * usually 150–400 KB and looks the same.
 */

/** How big each kind of picture needs to be (longest side, in pixels). */
export const IMAGE_SIZES = {
  /** Posts, chat photos, stories, listings, covers. */
  photo: 1920,
  /** Profile and group pictures, never shown bigger than about 160px. */
  avatar: 512,
} as const;

/** One year: files never change once uploaded (every upload gets a new name). */
export const LONG_CACHE = "31536000";

/** The size to draw at: the longest side capped at `max`, keeping the shape. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  if (width <= max && height <= max) return { width, height };
  const scale = max / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Files that are left as they are: animations and drawings would lose what makes them. */
const KEEP_AS_IS = /^image\/(gif|svg\+xml)$/;

/**
 * A smaller copy of `file` for upload, or the file itself when it's not a photo, is already
 * small, or can't be read here. Never throws.
 */
export async function shrinkImage(file: File, max: number = IMAGE_SIZES.photo, quality = 0.82): Promise<File> {
  if (!file.type.startsWith("image/") || KEEP_AS_IS.test(file.type)) return file;
  try {
    // from-image: phone photos are often stored sideways with a rotation note; apply it.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
    if (width === bitmap.width && file.size < 400 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    // Some older phones can't write WebP and hand back a PNG; JPEG is the safe second choice.
    const out = blob && blob.type === "image/webp" ? blob : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!out || out.size >= file.size) return file;
    const ext = out.type === "image/webp" ? "webp" : "jpg";
    return new File([out], file.name.replace(/\.[^.]+$/, "") + `.${ext}`, { type: out.type, lastModified: Date.now() });
  } catch {
    return file;
  }
}
