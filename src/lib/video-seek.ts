/** Double tap on a video, as on Facebook: the left side goes back 10 seconds, the right forward. */
export const SEEK_SECONDS = 10;

/** -1 for the left side, 1 for the right, 0 for the middle. */
export const seekSideAt = (clientX: number, box: DOMRect): -1 | 1 | 0 => {
  const x = (clientX - box.left) / box.width;
  return x < 0.35 ? -1 : x > 0.65 ? 1 : 0;
};

/** Moves a video by `seconds`, staying within it. */
export const seekBy = (video: HTMLVideoElement | null, seconds: number) => {
  if (!video || !Number.isFinite(video.duration)) return;
  video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + seconds));
};
