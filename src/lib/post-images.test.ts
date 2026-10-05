import { describe, expect, it } from "vitest";
import { postImages } from "./post-images";

describe("postImages", () => {
  it("prefers the full list", () => {
    expect(postImages({ image_url: "a", image_urls: ["a", "b", "c"] })).toEqual(["a", "b", "c"]);
  });

  it("falls back to the single image of older posts", () => {
    expect(postImages({ image_url: "a", image_urls: [] })).toEqual(["a"]);
    expect(postImages({ image_url: "a", image_urls: null })).toEqual(["a"]);
    expect(postImages({ image_url: "a" })).toEqual(["a"]);
  });

  it("is empty for text posts", () => {
    expect(postImages({ image_url: null, image_urls: null })).toEqual([]);
  });
});
