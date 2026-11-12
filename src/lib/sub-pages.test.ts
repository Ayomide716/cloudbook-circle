import { describe, expect, it } from "vitest";
import { isSubPage } from "./sub-pages";

describe("isSubPage", () => {
  it("is true for pages reached from somewhere else", () => {
    for (const p of ["/messages", "/menu", "/friends", "/groups", "/notifications", "/settings", "/post/abc", "/groups/123", "/explore"]) expect(isSubPage(p)).toBe(true);
  });
  it("is false for Home, Reels and profiles (their own bars or covers)", () => {
    for (const p of ["/", "/reels", "/profile/x"]) expect(isSubPage(p)).toBe(false);
  });
});
