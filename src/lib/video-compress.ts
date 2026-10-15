/**
 * Videos are made smaller on the phone before they're uploaded, the way Facebook re-encodes
 * every upload on its own servers: at most 720p and about 2 Mbit/s. A minute of phone video is
 * often 100+ MB; this way it's around 15 MB, and every view downloads that much less.
 *
 * Fast way (most phones): the phone's own video hardware through WebCodecs (Mediabunny), several
 * times faster than playing the video. Slow way (older browsers): replay the video into a canvas
 * and record it (MediaRecorder), which takes as long as the video plays. If neither works (old
 * phones, videos it can't read, the app going to the background) the original is uploaded.
 * Never throws.
 */
import { fitWithin } from "./image-compress";

/** Reels are short, as on Facebook and Instagram. */
export const REEL_MAX_SECONDS = 60;
/** 720p: the longest side of a landscape 1280×720 or portrait 720×1280 video. */
export const VIDEO_MAX_SIDE = 1280;
const VIDEO_BITS_PER_SECOND = 2_000_000;
const AUDIO_BITS_PER_SECOND = 96_000;
/** Re-encoding happens in real time; past this, the original is uploaded instead. */
const MAX_ENCODE_SECONDS = 180;

/** Worth re-encoding: bigger than 720p, or using much more data per second than needed. */
export function needsShrinking(width: number, height: number, bytes: number, seconds: number): boolean {
  if (Math.max(width, height) > VIDEO_MAX_SIDE) return true;
  if (!(seconds > 0)) return false;
  return (bytes * 8) / seconds > VIDEO_BITS_PER_SECOND * 1.3;
}

/**
 * H.264 MP4 only: it plays on every phone (it's what Facebook delivers). Phones that can't
 * record it (older Android, some browsers) upload the original instead of making a video that
 * iPhones couldn't play.
 */
export function pickRecordingType(isSupported: (type: string) => boolean): string | null {
  const types = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1.4D401F,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
  ];
  return types.find((t) => isSupported(t)) ?? null;
}

type CanvasWithStream = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };
type VideoWithFrames = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };

/** The longest video the fast way takes on (it's quick, but a long one is still a big job). */
const MAX_FAST_SECONDS = 15 * 60;

type FastResult = { file: File } | { keep: true } | null;

/**
 * The fast way: decode and encode with the phone's video hardware (WebCodecs), not in real time.
 * `{ keep: true }`: the video is already light, upload it as it is. `null`: couldn't, try the slow way.
 */
async function shrinkVideoFast(file: File, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<FastResult> {
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") return null;
  try {
    const mb = await import("mediabunny");
    if (!(await mb.canEncodeVideo("avc"))) return null;
    const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const seconds = await input.computeDuration();
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_FAST_SECONDS) return null;
    if (!needsShrinking(track.displayWidth, track.displayHeight, file.size, seconds)) return fastStart(mb, input, file);

    const size = fitWithin(track.displayWidth, track.displayHeight, VIDEO_MAX_SIDE);
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    const conversion = await mb.Conversion.init({
      input,
      output,
      showWarnings: false,
      video: { width: size.width - (size.width % 2), height: size.height - (size.height % 2), fit: "fill", codec: "avc", bitrate: VIDEO_BITS_PER_SECOND },
      // AAC plays everywhere. Phone videos have it already, so the sound is copied as is (no
      // bitrate here: setting one would re-encode it, and not every phone can encode AAC).
      audio: { codec: "aac" },
    });
    // A video that would lose its picture or sound here goes the slow way instead.
    // (Extra tracks some phones add, like a second video angle, can be left out.)
    const lost = conversion.discardedTracks.some((t) => !t.reason.startsWith("max_track_count"));
    if (!conversion.isValid || lost) return null;
    conversion.onProgress = (p) => onProgress?.(Math.min(1, p));
    const abort = () => void conversion.cancel();
    signal?.addEventListener("abort", abort);
    try {
      await conversion.execute();
    } finally {
      signal?.removeEventListener("abort", abort);
    }
    const buffer = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
    if (!buffer || buffer.byteLength === 0) return null;
    onProgress?.(1);
    if (buffer.byteLength >= file.size * 0.9) return { keep: true };
    return { file: new File([buffer], file.name.replace(/\.[^.]+$/, "") + ".mp4", { type: "video/mp4", lastModified: Date.now() }) };
  } catch {
    return null;
  }
}

/**
 * A light video kept as it is, but rearranged so it can start playing before it has all
 * downloaded (many phone cameras put the index at the end of the file). Nothing is re-encoded:
 * the picture and sound are copied, so it takes a moment. Anything unexpected: the original.
 */
async function fastStart(mb: typeof import("mediabunny"), input: InstanceType<typeof import("mediabunny").Input>, file: File): Promise<FastResult> {
  if (!/^video\/(mp4|quicktime)$/.test(file.type)) return { keep: true };
  try {
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    const conversion = await mb.Conversion.init({ input, output, showWarnings: false });
    if (!conversion.isValid || conversion.discardedTracks.some((t) => !t.reason.startsWith("max_track_count"))) return { keep: true };
    await conversion.execute();
    const buffer = (output.target as InstanceType<typeof mb.BufferTarget>).buffer;
    if (!buffer || buffer.byteLength === 0) return { keep: true };
    return { file: new File([buffer], file.name.replace(/\.[^.]+$/, "") + ".mp4", { type: "video/mp4", lastModified: Date.now() }) };
  } catch {
    return { keep: true };
  }
}

export async function shrinkVideo(file: File, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<File> {
  if (!file.type.startsWith("video/")) return file;
  const fast = await shrinkVideoFast(file, onProgress, signal);
  if (signal?.aborted) return file;
  if (fast) return "keep" in fast ? file : fast.file;
  return shrinkVideoSlow(file, onProgress);
}

async function shrinkVideoSlow(file: File, onProgress?: (fraction: number) => void): Promise<File> {
  if (typeof MediaRecorder === "undefined") return file;
  const canvas = document.createElement("canvas") as CanvasWithStream;
  if (!canvas.captureStream) return file;

  const src = URL.createObjectURL(file);
  const video = document.createElement("video") as VideoWithFrames;
  let audio: AudioContext | null = null;
  try {
    video.src = src;
    video.playsInline = true;
    video.preload = "auto";
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("unreadable"));
      setTimeout(() => reject(new Error("timeout")), 10_000);
    });
    const seconds = video.duration;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_ENCODE_SECONDS) return file;
    if (!needsShrinking(video.videoWidth, video.videoHeight, file.size, seconds)) return file;

    const mimeType = pickRecordingType((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType) return file;

    // Even sizes: some encoders refuse odd ones.
    const size = fitWithin(video.videoWidth, video.videoHeight, VIDEO_MAX_SIDE);
    canvas.width = size.width - (size.width % 2);
    canvas.height = size.height - (size.height % 2);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    const stream = canvas.captureStream(30);
    // The sound goes into the recording only, not out of the speaker.
    try {
      audio = new AudioContext();
      const source = audio.createMediaElementSource(video);
      const out = audio.createMediaStreamDestination();
      source.connect(out);
      out.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      await audio.resume();
    } catch {
      // No sound track available: record the picture only (rare; e.g. a silent clip).
    }

    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: VIDEO_BITS_PER_SECOND, audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

    let aborted = false;
    const draw = () => {
      if (aborted || video.ended) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      onProgress?.(Math.min(1, video.currentTime / seconds));
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(draw);
      else requestAnimationFrame(draw);
    };
    // In the background, frames stop being drawn and the result would freeze: give up instead.
    const onHidden = () => { if (document.hidden) aborted = true; };
    document.addEventListener("visibilitychange", onHidden);

    const ended = new Promise<void>((resolve) => { video.onended = () => resolve(); });
    recorder.start(1000);
    await video.play();
    draw();
    const limit = new Promise<void>((resolve) => setTimeout(() => { aborted = true; resolve(); }, (seconds * 2 + 15) * 1000));
    const watchAbort = new Promise<void>((resolve) => {
      const t = setInterval(() => { if (aborted) { clearInterval(t); resolve(); } }, 250);
      ended.then(() => clearInterval(t));
    });
    await Promise.race([ended, limit, watchAbort]);
    document.removeEventListener("visibilitychange", onHidden);
    video.pause();
    if (recorder.state !== "inactive") recorder.stop();
    await stopped;
    if (aborted) return file;

    const blob = new Blob(chunks, { type: "video/mp4" });
    onProgress?.(1);
    if (blob.size === 0 || blob.size >= file.size * 0.9) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".mp4", { type: "video/mp4", lastModified: Date.now() });
  } catch {
    return file;
  } finally {
    video.pause();
    video.removeAttribute("src");
    URL.revokeObjectURL(src);
    audio?.close().catch(() => {});
  }
}
