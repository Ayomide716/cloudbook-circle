import { describe, expect, it, vi } from "vitest";
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

  it("only treats GIPHY's and Tenor's own media hosts as stickers", () => {
    expect(isGiphyMedia("https://media.tenor.com/abc/x.gif")).toBe(true);
    expect(isGiphyMedia("https://media.tenor.com.evil.example/x.gif")).toBe(false);
    expect(isGiphyMedia("https://media1.giphy.com/media/abc/200.gif")).toBe(true);
    expect(isGiphyMedia("https://media.giphy.com/media/abc/200.gif")).toBe(true);
    expect(isGiphyMedia("https://evil.example/giphy.com/x.gif")).toBe(false);
    expect(isGiphyMedia("http://media1.giphy.com/x.gif")).toBe(false);
    expect(isGiphyMedia(null)).toBe(false);
  });
});

describe("finding GIFs and stickers", () => {
  it("uses Tenor when GIPHY says no, and remembers the result", async () => {
    const { findStickers } = await import("./giphy");
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("api.giphy.com")
        ? new Response("{}", { status: 429 })
        : new Response(JSON.stringify({ results: [{ id: "t1", media_formats: { gif_transparent: { url: "https://media.tenor.com/t1/a.gif" }, tinygif_transparent: { url: "https://media.tenor.com/t1/s.gif" } } }] }))
    );
    vi.stubGlobal("fetch", fetchMock);
    const first = await findStickers("cat wave");
    expect(first).toEqual([{ id: "t1", url: "https://media.tenor.com/t1/a.gif", preview: "https://media.tenor.com/t1/s.gif", title: "Sticker" }]);
    const calls = fetchMock.mock.calls.length;
    expect(await findStickers("Cat wave ")).toEqual(first);
    expect(fetchMock.mock.calls.length).toBe(calls);
    vi.unstubAllGlobals();
  });
});
