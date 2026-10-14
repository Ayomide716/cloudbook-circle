import { describe, expect, it } from "vitest";
import { needsShrinking, pickRecordingType } from "./video-compress";

describe("making videos smaller before upload", () => {
  it("re-encodes anything bigger than 720p", () => {
    expect(needsShrinking(1920, 1080, 5_000_000, 30)).toBe(true);
    expect(needsShrinking(1080, 1920, 5_000_000, 30)).toBe(true);
  });

  it("re-encodes 720p video that uses far more data than it needs", () => {
    // 60 MB for 30 s is 16 Mbit/s.
    expect(needsShrinking(1280, 720, 60_000_000, 30)).toBe(true);
    // 6 MB for 30 s is 1.6 Mbit/s: already small.
    expect(needsShrinking(1280, 720, 6_000_000, 30)).toBe(false);
  });

  it("records H.264 MP4 only, so every phone can play the result", () => {
    expect(pickRecordingType((t) => t.startsWith("video/mp4;codecs=avc1"))).toBe("video/mp4;codecs=avc1.42E01E,mp4a.40.2");
    // Only WebM (or MP4 with VP9) available: upload the original instead.
    expect(pickRecordingType((t) => t.startsWith("video/webm") || t === "video/mp4")).toBeNull();
  });
});
