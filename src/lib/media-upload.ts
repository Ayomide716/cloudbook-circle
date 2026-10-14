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

/** Where the last upload in this session went, and if it wasn't R2, why (Settings → Photo storage). */
export interface LastUpload {
  target: "r2" | "supabase";
  reason?: string;
  at: number;
}
let lastUpload: LastUpload | null = null;
export const getLastUpload = () => lastUpload;
let r2SkipReason = "";
let pauseReason = "";

/** What a failed upload to R2 means, in words. */
export function describeR2Failure(status: number, origin = typeof location !== "undefined" ? location.origin : ""): string {
  if (status === 0) return `Cloudflare blocked the upload from ${origin}. Add exactly "${origin}" to the bucket's CORS policy (AllowedOrigins), or check R2_ACCOUNT_ID.`;
  if (status === 403) return "Cloudflare refused the key (403). Check R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and that the token has Object Read & Write on this bucket.";
  if (status === 404) return "Cloudflare couldn't find the bucket (404). Check R2_BUCKET and R2_ACCOUNT_ID.";
  return `Cloudflare answered ${status}.`;
}

class UploadError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function r2Ticket(folder: MediaFolder, file: Blob, ext: string): Promise<Ticket | null> {
  if (Date.now() < r2OffUntil) {
    r2SkipReason = `${pauseReason} (R2 is tried again 10 minutes after a failure.)`;
    return null;
  }
  try {
    const { data, error } = await supabase.functions.invoke<Ticket>("media-upload", {
      // "audio/webm;codecs=opus" → "audio/webm": the upload link is signed for the plain type.
      body: { folder, contentType: (file.type || "application/octet-stream").split(";")[0].trim(), size: file.size, ext },
    });
    if (error || !data?.uploadUrl) {
      // 503 "not-configured" (or the function isn't deployed yet): Supabase Storage for now.
      const status = (error as { context?: { status?: number } } | null)?.context?.status;
      if (!status || status === 503 || status === 404) r2OffUntil = Date.now() + 10 * 60_000;
      r2SkipReason = status === 503 ? "R2 isn't set up yet (a secret is missing)." : status === 404 ? "The media-upload function isn't deployed." : `The media-upload function failed (${status ?? "no answer"}).`;
      pauseReason = r2SkipReason;
      return null;
    }
    return data;
  } catch {
    r2SkipReason = "Couldn't reach the media-upload function.";
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
      reject(new UploadError(message, xhr.status));
    };
    xhr.onerror = () => reject(new UploadError("Network error while uploading.", 0));
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
      lastUpload = { target: "r2", at: Date.now() };
      return ticket.publicUrl;
    } catch (e) {
      // R2 unreachable from here (e.g. its CORS isn't set up yet): Supabase Storage instead.
      r2OffUntil = Date.now() + 10 * 60_000;
      r2SkipReason = pauseReason = describeR2Failure(e instanceof UploadError ? e.status : 0);
      console.warn("[media-upload] R2 failed, using Supabase:", r2SkipReason);
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
  lastUpload = { target: "supabase", reason: r2SkipReason || undefined, at: Date.now() };
  r2SkipReason = "";
  return supabase.storage.from(folder).getPublicUrl(path).data.publicUrl;
}

export interface StorageTest {
  ok: boolean;
  /** Each step, in order, in words. */
  steps: { ok: boolean; text: string }[];
}

/**
 * Settings → Photo storage → Test. Checks each link in the chain: the function and its secrets,
 * the R2 key (from the server), uploading from this app (CORS), and the public address.
 */
export async function testStorage(): Promise<StorageTest> {
  const steps: StorageTest["steps"] = [];
  const done = () => ({ ok: steps.every((s) => s.ok), steps });

  const { data, error } = await supabase.functions.invoke<{
    server: { ok: boolean; status: number; code?: string };
    bucket: string;
    uploadUrl: string;
    headers: Record<string, string>;
    publicUrl: string;
  }>("media-upload", { body: { check: true } });
  if (error || !data?.server) {
    const ctx = (error as { context?: Response } | null)?.context;
    let detail = "";
    try {
      const body = await ctx?.json();
      if (body?.missing?.length) detail += ` Missing secrets: ${body.missing.join(", ")}.`;
      if (body?.bad?.length) detail += ` These don't look right: ${body.bad.join(", ")} (the account ID is 32 letters and numbers; the bucket name is lowercase, like ember-media).`;
    } catch {
      // No details.
    }
    const status = ctx?.status;
    steps.push({
      ok: false,
      text: status === 503 ? `R2 isn't set up.${detail}` : status === 404 ? "The media-upload function isn't deployed." : `The media-upload function failed (${status ?? "no answer"}). If it's old, deploy the latest version.`,
    });
    return done();
  }
  steps.push({ ok: true, text: "media-upload function and secrets found." });

  const { server } = data;
  steps.push(
    server.ok
      ? { ok: true, text: `The R2 key works (wrote a test file to "${data.bucket}").` }
      : server.status === 0
        ? { ok: false, text: `The server couldn't reach Cloudflare: check R2_ACCOUNT_ID (the 32-character Account ID on the R2 overview page).${server.code ? ` Error: ${server.code}` : ""}` }
        : { ok: false, text: `${describeR2Failure(server.status)}${server.code ? ` (${server.code})` : ""}` },
  );
  if (!server.ok) return done();

  try {
    await put(data.uploadUrl, new Blob(["ok"], { type: "text/plain" }), data.headers, "PUT");
    steps.push({ ok: true, text: `Uploading from this app (${location.origin}) works.` });
  } catch (e) {
    steps.push({ ok: false, text: describeR2Failure(e instanceof UploadError ? e.status : 0) });
    return done();
  }

  try {
    const res = await fetch(`${data.publicUrl}?t=${Date.now()}`, { cache: "no-store" });
    steps.push(res.ok ? { ok: true, text: "Files open from R2_PUBLIC_URL." } : { ok: false, text: `R2_PUBLIC_URL answered ${res.status}: check it's the bucket's public r2.dev address and public access is on.` });
  } catch {
    steps.push({ ok: false, text: "Couldn't open a file from R2_PUBLIC_URL: check the address and that public access is on." });
  }

  // Everything works: stop pausing after an earlier failure.
  if (steps.every((s) => s.ok)) r2OffUntil = 0;
  return done();
}
