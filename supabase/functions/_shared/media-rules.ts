// What can be uploaded where (shared by the media-upload function and the app's tests).
// No Deno or browser APIs here, so it runs in both.

export interface FolderRule {
  /** Allowed content types, by prefix ("image/" allows image/webp, image/jpeg, ...). */
  types: string[];
  /** Largest file accepted, in bytes. */
  maxBytes: number;
}

const MB = 1024 * 1024;

/** Each folder mirrors one of the app's Supabase storage buckets. */
export const FOLDERS: Record<string, FolderRule> = {
  "post-images": { types: ["image/"], maxBytes: 15 * MB },
  "post-videos": { types: ["video/"], maxBytes: 100 * MB },
  "avatars": { types: ["image/"], maxBytes: 10 * MB },
  "chat-images": { types: ["image/", "video/"], maxBytes: 100 * MB },
  "voice-messages": { types: ["audio/"], maxBytes: 15 * MB },
  "marketplace": { types: ["image/"], maxBytes: 15 * MB },
  "page-images": { types: ["image/"], maxBytes: 15 * MB },
  "watch-videos": { types: ["video/", "image/"], maxBytes: 500 * MB },
};

export type UploadCheck =
  | { ok: true; key: string }
  | { ok: false; status: number; error: string };

/**
 * Where a signed-in user's upload goes. The server picks the name (under the user's own id), so
 * nobody can overwrite someone else's file or choose a misleading path.
 */
export function planUpload(
  userId: string,
  body: { folder?: unknown; contentType?: unknown; size?: unknown; ext?: unknown },
  now = Date.now(),
  random = Math.random().toString(36).slice(2, 10),
): UploadCheck {
  const folder = typeof body.folder === "string" ? body.folder : "";
  const rule = FOLDERS[folder];
  if (!rule) return { ok: false, status: 400, error: "Unknown folder" };
  const contentType = typeof body.contentType === "string" ? body.contentType.toLowerCase() : "";
  if (!rule.types.some((t) => contentType.startsWith(t)) || !/^[a-z]+\/[a-z0-9.+-]+$/.test(contentType)) {
    return { ok: false, status: 415, error: "That kind of file can't go here" };
  }
  const size = typeof body.size === "number" ? body.size : NaN;
  if (!Number.isFinite(size) || size <= 0) return { ok: false, status: 400, error: "Missing file size" };
  if (size > rule.maxBytes) return { ok: false, status: 413, error: `Files here can be up to ${Math.round(rule.maxBytes / MB)} MB` };
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false, status: 401, error: "Please sign in." };
  const rawExt = typeof body.ext === "string" ? body.ext.toLowerCase() : "";
  const ext = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : contentType.split("/")[1].replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  return { ok: true, key: `${folder}/${userId}/${now}-${random}.${ext}` };
}

export interface R2Settings {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
}

/**
 * Tidies the R2 secrets the way people tend to paste them: with spaces or a line break, the
 * account ID inside the whole "https://<id>.r2.cloudflarestorage.com" address, the public
 * address without "https://" or with a "/" at the end. `missing` and `bad` are secret names only.
 */
export function readR2Settings(env: (name: string) => string | undefined):
  | { ok: true; settings: R2Settings }
  | { ok: false; missing: string[]; bad: string[] } {
  const raw = {
    R2_ACCOUNT_ID: env("R2_ACCOUNT_ID")?.trim() ?? "",
    R2_ACCESS_KEY_ID: env("R2_ACCESS_KEY_ID")?.trim() ?? "",
    R2_SECRET_ACCESS_KEY: env("R2_SECRET_ACCESS_KEY")?.trim() ?? "",
    R2_BUCKET: env("R2_BUCKET")?.trim().replace(/^\/+|\/+$/g, "") ?? "",
    R2_PUBLIC_URL: env("R2_PUBLIC_URL")?.trim().replace(/\/+$/, "") ?? "",
  };
  const missing = Object.entries(raw).filter(([, v]) => !v).map(([k]) => k);
  const accountId = raw.R2_ACCOUNT_ID.match(/[0-9a-f]{32}/i)?.[0]?.toLowerCase() ?? "";
  const publicUrl = raw.R2_PUBLIC_URL && !/^https?:\/\//i.test(raw.R2_PUBLIC_URL) ? `https://${raw.R2_PUBLIC_URL}` : raw.R2_PUBLIC_URL;
  const bad: string[] = [];
  if (raw.R2_ACCOUNT_ID && !accountId) bad.push("R2_ACCOUNT_ID");
  if (raw.R2_BUCKET && !/^[a-z0-9][a-z0-9-]{1,62}$/.test(raw.R2_BUCKET)) bad.push("R2_BUCKET");
  if (missing.length || bad.length) return { ok: false, missing, bad };
  return {
    ok: true,
    settings: { accountId, accessKeyId: raw.R2_ACCESS_KEY_ID, secretAccessKey: raw.R2_SECRET_ACCESS_KEY, bucket: raw.R2_BUCKET, publicUrl },
  };
}
