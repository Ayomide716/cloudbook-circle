/**
 * Waveforms for voice notes: the loudness of the recording in a few dozen bars, worked out in
 * the browser from the audio itself. Remembered per recording for the visit.
 */

type Result = { peaks: number[]; duration: number } | null;
const cache = new Map<string, Promise<Result>>();

/** Bars that look like speech, the same every time for the same recording, shown until the real ones are ready. */
export function fallbackPeaks(seed: string, bars: number): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const noise = ((h >>> 0) % 1000) / 1000;
    const envelope = Math.sin((Math.PI * (i + 0.5)) / bars) * 0.6 + 0.4;
    out.push(0.25 + 0.6 * noise * envelope);
  }
  return out;
}

/** Splits samples into `bars` buckets and keeps each bucket's loudness, scaled so the loudest is 1. */
export function peaksFromSamples(samples: Float32Array, bars: number): number[] {
  const size = Math.max(1, Math.floor(samples.length / bars));
  const peaks: number[] = [];
  for (let b = 0; b < bars; b++) {
    let sum = 0;
    const start = b * size;
    const end = Math.min(samples.length, start + size);
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    peaks.push(end > start ? Math.sqrt(sum / (end - start)) : 0);
  }
  const max = Math.max(...peaks, 1e-6);
  return peaks.map((p) => Math.min(1, Math.max(0.15, p / max)));
}

export function loadPeaks(url: string, bars: number): Promise<Result> {
  const key = `${bars}|${url}`;
  let job = cache.get(key);
  if (!job) {
    job = (async () => {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return null;
        const data = await (await fetch(url)).arrayBuffer();
        const ctx = new AC();
        try {
          const buffer = await ctx.decodeAudioData(data);
          return { peaks: peaksFromSamples(buffer.getChannelData(0), bars), duration: buffer.duration };
        } finally {
          void ctx.close();
        }
      } catch {
        return null;
      }
    })();
    cache.set(key, job);
  }
  return job;
}
