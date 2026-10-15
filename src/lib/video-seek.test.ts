import { describe, expect, it } from "vitest";
import { seekBy, seekSideAt } from "./video-seek";

const box = { left: 0, width: 300 } as DOMRect;

describe("video-seek", () => {
  it("splits a video into back, middle and forward", () => {
    expect(seekSideAt(50, box)).toBe(-1);
    expect(seekSideAt(150, box)).toBe(0);
    expect(seekSideAt(250, box)).toBe(1);
  });

  it("stays within the video", () => {
    const v = { duration: 30, currentTime: 5 } as HTMLVideoElement;
    seekBy(v, -10);
    expect(v.currentTime).toBe(0);
    seekBy(v, 40);
    expect(v.currentTime).toBe(30);
  });
});
