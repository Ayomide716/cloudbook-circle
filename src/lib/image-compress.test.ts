import { describe, expect, it } from "vitest";
import { fitWithin, shrinkImage } from "./image-compress";

describe("shrinking photos before upload", () => {
  it("keeps the shape and caps the longest side", () => {
    expect(fitWithin(4000, 3000, 1920)).toEqual({ width: 1920, height: 1440 });
    expect(fitWithin(3000, 4000, 512)).toEqual({ width: 384, height: 512 });
    expect(fitWithin(800, 600, 1920)).toEqual({ width: 800, height: 600 });
  });

  it("leaves GIFs, videos and unreadable files alone", async () => {
    const gif = new File(["GIF89a"], "party.gif", { type: "image/gif" });
    const video = new File(["x"], "clip.mp4", { type: "video/mp4" });
    const broken = new File(["not really a jpeg"], "photo.jpg", { type: "image/jpeg" });
    expect(await shrinkImage(gif)).toBe(gif);
    expect(await shrinkImage(video)).toBe(video);
    expect(await shrinkImage(broken)).toBe(broken);
  });
});
