import { describe, expect, it } from "vitest";
import { fromGiphy, isGiphyMedia } from "./giphy";

describe("giphy", () => {
  it("picks a small preview for the grid and a bigger file to send", () => {
    const [g] = fromGiphy([
      {
        id: "abc",
        title: "Happy dance",
        images: {
          fixed_width_small: { url: "https://media2.giphy.com/media/abc/100w.gif", webp: "https://media2.giphy.com/media/abc/100w.webp" },
          fixed_height: { url: "https://media2.giphy.com/media/abc/200.gif" },
        },
      },
    ]);
    expect(g).toEqual({ id: "abc", title: "Happy dance", preview: "https://media2.giphy.com/media/abc/100w.webp", url: "https://media2.giphy.com/media/abc/200.gif" });
  });

  it("skips results without a usable file", () => {
    expect(fromGiphy([{ id: "x", images: {} }])).toEqual([]);
  });

  it("only treats GIPHY's own media hosts as GIPHY stickers", () => {
    expect(isGiphyMedia("https://media1.giphy.com/media/abc/200.gif")).toBe(true);
    expect(isGiphyMedia("https://media.giphy.com/media/abc/200.gif")).toBe(true);
    expect(isGiphyMedia("https://evil.example/giphy.com/x.gif")).toBe(false);
    expect(isGiphyMedia("http://media1.giphy.com/x.gif")).toBe(false);
    expect(isGiphyMedia(null)).toBe(false);
  });
});
