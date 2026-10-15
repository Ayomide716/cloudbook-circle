/**
 * Videos are prepared and uploaded in the background, the way Facebook and Instagram do it.
 *
 * Picking a video starts the work at once (making it smaller, then uploading), while you write
 * the caption. Tapping Post closes the composer straight away; a small "Posting…" bar shows the
 * progress, and the post or reel is saved the moment its video is up. You can keep using the
 * app meanwhile (only closing the app stops it).
 *
 * Composers keep a job's reference ("videojob:<id>") where they'd keep a video address.
 */
import { useSyncExternalStore } from "react";
import { uploadMedia, type MediaFolder } from "./media-upload";
import { shrinkVideo } from "./video-compress";
import { readVideoInfo } from "./storage-upload";
import { getErrorMessage } from "./utils";

export type VideoJobPhase = "preparing" | "uploading" | "done" | "failed";

export interface VideoJob {
  id: string;
  /** A local address for previewing the picked video straight away. */
  preview: string;
  phase: VideoJobPhase;
  /** 0–100 within the current phase. */
  progress: number;
  url?: string;
  /** A still from the video (reels show it while the video loads). */
  thumbnailUrl?: string;
  error?: string;
  /** Set once Post was tapped: what's being posted, and how it went. */
  posting?: { label: string; failed?: boolean };
}

interface Internal extends VideoJob {
  file: File;
  folder: MediaFolder;
  userId: string;
  controller: AbortController;
  result: Promise<string>;
  save?: (url: string, thumbnailUrl: string | null) => Promise<void>;
}

const jobs = new Map<string, Internal>();
const listeners = new Set<() => void>();
// useSyncExternalStore needs the same snapshot until something changes.
let snapshot: VideoJob[] = [];
const emit = () => {
  snapshot = [...jobs.values()].map(publicView);
  listeners.forEach((l) => l());
};
const publicView = (j: Internal): VideoJob => ({ id: j.id, preview: j.preview, phase: j.phase, progress: j.progress, url: j.url, error: j.error, posting: j.posting });
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const update = (j: Internal, patch: Partial<Internal>) => {
  Object.assign(j, patch);
  emit();
};

const PREFIX = "videojob:";
export const videoJobRef = (id: string) => `${PREFIX}${id}`;
export const isVideoJobRef = (value: string | null | undefined): value is string => !!value?.startsWith(PREFIX);
const idOf = (ref: string) => ref.slice(PREFIX.length);

function run(j: Internal): Promise<string> {
  const { signal } = j.controller;
  return (async () => {
    update(j, { phase: "preparing", progress: 0, error: undefined });
    const file = await shrinkVideo(j.file, (f) => update(j, { progress: Math.round(f * 100) }), signal);
    if (signal.aborted) throw new Error("cancelled");
    if (file.size > 100 * 1024 * 1024) throw new Error("This video is over 100 MB even after shrinking. Try a shorter one.");
    update(j, { phase: "uploading", progress: 0 });
    const ext = file.name.split(".").pop() || "mp4";
    const url = await uploadMedia(j.folder, `${j.userId}/${Date.now()}.${ext}`, file, (p) => update(j, { progress: p }));
    if (signal.aborted) throw new Error("cancelled");
    // A still for the reel's poster; never holds up the post.
    let thumbnailUrl: string | undefined;
    try {
      const { thumbnail } = await readVideoInfo(j.file);
      if (thumbnail) thumbnailUrl = await uploadMedia("post-images", `${j.userId}/${Date.now()}-poster.jpg`, new File([thumbnail], "poster.jpg", { type: "image/jpeg" }));
    } catch {
      // No poster: the reel shows black until it plays.
    }
    update(j, { phase: "done", progress: 100, url, thumbnailUrl });
    return url;
  })().catch((e) => {
    if (!signal.aborted) update(j, { phase: "failed", error: getErrorMessage(e) });
    throw e;
  });
}

/** Starts preparing and uploading `file`; returns the reference to keep in the composer. */
export function startVideoJob(file: File, folder: MediaFolder, userId: string): string {
  const id = Math.random().toString(36).slice(2, 10);
  const j: Internal = {
    id, file, folder, userId,
    preview: URL.createObjectURL(file),
    phase: "preparing", progress: 0,
    controller: new AbortController(),
    result: Promise.resolve(""),
  };
  jobs.set(id, j);
  j.result = run(j);
  j.result.catch(() => {}); // Failures are shown from the job's state.
  emit();
  return videoJobRef(id);
}

/** The video was removed or the post abandoned: stop working on it. */
export function cancelVideoJob(ref: string) {
  const j = jobs.get(idOf(ref));
  if (!j) return;
  j.controller.abort();
  URL.revokeObjectURL(j.preview);
  jobs.delete(j.id);
  emit();
}

/** The job's current state (for a preview and its progress). */
export function useVideoJob(ref: string | null | undefined): VideoJob | null {
  const all = useSyncExternalStore(subscribe, () => snapshot);
  if (!isVideoJobRef(ref)) return null;
  return all.find((j) => j.id === idOf(ref)) ?? null;
}

/** Posts waiting on (or done with) their video, for the "Posting…" bar. */
export function usePostingJobs(): VideoJob[] {
  const all = useSyncExternalStore(subscribe, () => snapshot);
  return all.filter((j) => j.posting);
}

/** Something was posted in the background: lists showing posts or reels can refresh. */
export const POSTED_EVENT = "ember:posted";

async function finishPosting(j: Internal) {
  try {
    const url = await j.result;
    await j.save!(url, j.thumbnailUrl ?? null);
    URL.revokeObjectURL(j.preview);
    jobs.delete(j.id);
    emit();
    window.dispatchEvent(new CustomEvent(POSTED_EVENT, { detail: { label: j.posting?.label } }));
  } catch (e) {
    if (j.controller.signal.aborted) return;
    update(j, { phase: "failed", error: j.error ?? getErrorMessage(e), posting: { ...j.posting!, failed: true } });
  }
}

/**
 * Tap on Post: saves the post with the video's address as soon as the upload is done (at once if
 * it already is). The composer can close straight away.
 */
export function postWhenReady(ref: string, label: string, save: (url: string, thumbnailUrl: string | null) => Promise<void>) {
  const j = jobs.get(idOf(ref));
  if (!j) throw new Error("That video is no longer here. Please pick it again.");
  update(j, { save, posting: { label } });
  void finishPosting(j);
}

/** "Try again" on a failed post: prepares and uploads the same video again (or just saves again). */
export function retryPosting(id: string) {
  const j = jobs.get(id);
  if (!j?.posting) return;
  update(j, { posting: { label: j.posting.label } });
  if (!j.url) {
    j.controller = new AbortController();
    j.result = run(j);
  } else {
    j.result = Promise.resolve(j.url);
  }
  j.result.catch(() => {});
  void finishPosting(j);
}

/** Close a failed post's bar for good. */
export function dismissPosting(id: string) {
  cancelVideoJob(videoJobRef(id));
}
