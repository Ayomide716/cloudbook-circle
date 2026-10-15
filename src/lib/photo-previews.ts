/**
 * Facebook-style blurred previews: a tiny copy of each photo (about 16 px wide, under 1 KB) is
 * made when it's picked and saved with the post, so the post shows a soft blur of the photo
 * at once while the real one loads.
 */

const made = new Map<string, string>();

/** A tiny JPEG of the picked photo, as a data: address (null if the browser can't). */
export async function makePreview(file: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const width = 16;
    const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.min(height, 48);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const url = canvas.toDataURL("image/jpeg", 0.6);
    return url.length < 2000 ? url : null;
  } catch {
    return null;
  }
}

/** Keeps the preview for an uploaded photo's address until the post is saved. */
export function rememberPreview(url: string, preview: string | null) {
  if (preview) made.set(url, preview);
}

/** Previews for these photos, in order ("" where there isn't one). */
export function previewsFor(urls: string[]): string[] {
  return urls.map((u) => made.get(u) ?? "");
}
