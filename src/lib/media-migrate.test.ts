import { describe, expect, it } from "vitest";
import { storageKey, swapUrls } from "../../supabase/functions/_shared/media-migrate";

const old = "https://abc.supabase.co/storage/v1/object/public/post-images/u1/a%20b.webp";

describe("media migrate helpers", () => {
  it("finds the bucket and path of Supabase Storage files only", () => {
    expect(storageKey(old)).toBe("post-images/u1/a b.webp");
    expect(storageKey(`${old}?t=1`)).toBe("post-images/u1/a b.webp");
    expect(storageKey("https://pub-1.r2.dev/post-images/u1/a.webp")).toBeNull();
    expect(storageKey("https://abc.supabase.co/storage/v1/object/public/../x")).toBeNull();
    expect(storageKey(null)).toBeNull();
  });

  it("swaps moved addresses in strings and lists, leaving the rest", () => {
    const moved = new Map([[old, "https://pub-1.r2.dev/post-images/u1/a b.webp"]]);
    expect(swapUrls(old, moved)).toBe("https://pub-1.r2.dev/post-images/u1/a b.webp");
    expect(swapUrls([old, "https://x/y.png"], moved)).toEqual(["https://pub-1.r2.dev/post-images/u1/a b.webp", "https://x/y.png"]);
    expect(swapUrls(null, moved)).toBeNull();
  });
});
