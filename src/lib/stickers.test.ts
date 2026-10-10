import { describe, expect, it } from "vitest";
import { STICKER_PACKS, previewText, stickerId, stickerMessage, stickerUrl } from "./stickers";

describe("stickers", () => {
  it("round-trips a sticker through a message", () => {
    const msg = stickerMessage("1f602");
    expect(msg).toBe("[sticker]:1f602");
    expect(stickerId(msg)).toBe("1f602");
    expect(stickerUrl("1f602")).toBe("/stickers/1f602.webp");
  });

  it("ignores ordinary text and unknown or unsafe ids", () => {
    expect(stickerId("hello")).toBeNull();
    expect(stickerId("[sticker]:nope")).toBeNull();
    expect(stickerId("[sticker]:../../etc/passwd")).toBeNull();
    expect(stickerId(null)).toBeNull();
  });

  it("reads as 'Sticker' in chat lists, and leaves other text alone", () => {
    expect(previewText("[sticker]:1f525")).toBe("Sticker");
    expect(previewText("See you at 6")).toBe("See you at 6");
  });

  it("has no duplicate stickers across packs", () => {
    const ids = STICKER_PACKS.flatMap((p) => p.stickers.map(([id]) => id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
