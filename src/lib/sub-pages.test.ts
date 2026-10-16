import { describe, expect, it } from "vitest";
import { isSubPage } from "./sub-pages";

describe("isSubPage", () => {
  it("is true for pages reached from somewhere else", () => {
    for (const p of ["/messages", "/settings", "/post/abc", "/groups/123", "/explore"]) expect(isSubPage(p)).toBe(true);
  });
  it("is false for the tabs", () => {
    for (const p of ["/", "/friends", "/reels", "/groups", "/notifications", "/menu", "/profile/x"]) expect(isSubPage(p)).toBe(false);
  });
});
