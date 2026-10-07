import { describe, expect, it } from "vitest";
import { fallbackPeaks, peaksFromSamples } from "./waveform";

describe("voice note waveform", () => {
  it("gives steady placeholder bars for the same recording", () => {
    const a = fallbackPeaks("https://x/voice.webm", 36);
    expect(a).toHaveLength(36);
    expect(fallbackPeaks("https://x/voice.webm", 36)).toEqual(a);
    expect(a.every((p) => p > 0 && p <= 1)).toBe(true);
  });

  it("measures loud and quiet parts of a recording", () => {
    const samples = new Float32Array(1000);
    for (let i = 500; i < 1000; i++) samples[i] = i % 2 ? 0.8 : -0.8; // quiet, then loud
    const peaks = peaksFromSamples(samples, 4);
    expect(peaks[0]).toBeLessThan(0.2);
    expect(peaks[3]).toBe(1);
  });
});
