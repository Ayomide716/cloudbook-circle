import { describe, expect, it } from "vitest";
import { displayUrl, safeWebsiteUrl } from "./safe-url";

describe("safeWebsiteUrl", () => {
  it("adds https to bare domains", () => {
    expect(safeWebsiteUrl("example.com")).toBe("https://example.com/");
    expect(safeWebsiteUrl("  example.com/shop ")).toBe("https://example.com/shop");
  });

  it("keeps http and https links", () => {
    expect(safeWebsiteUrl("http://example.com/a?b=1")).toBe("http://example.com/a?b=1");
    expect(safeWebsiteUrl("https://example.com")).toBe("https://example.com/");
  });

  it.each(["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "file:///etc/passwd"])(
    "refuses %s",
    (value) => {
      expect(safeWebsiteUrl(value)).toBeNull();
    }
  );

  it("returns null for empty or broken input", () => {
    expect(safeWebsiteUrl(null)).toBeNull();
    expect(safeWebsiteUrl("   ")).toBeNull();
    expect(safeWebsiteUrl("https://")).toBeNull();
  });
});

describe("displayUrl", () => {
  it("drops the scheme and trailing slash", () => {
    expect(displayUrl("https://example.com/")).toBe("example.com");
    expect(displayUrl("http://example.com/shop")).toBe("example.com/shop");
  });
});
