import { uploadMedia, type MediaFolder } from "@/lib/media-upload";
import { makePreview, rememberPreview } from "@/lib/photo-previews";
import { shrinkImage } from "@/lib/image-compress";

/** Shrinks a photo, uploads it and keeps its blurred preview; returns its address. */
export async function uploadPhoto(bucket: string, userId: string, picked: File) {
  const file = await shrinkImage(picked);
  const fileExt = file.name.split(".").pop();
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
  const [url, preview] = await Promise.all([uploadMedia(bucket as MediaFolder, fileName, file), makePreview(file)]);
  rememberPreview(url, preview);
  return url;
}

