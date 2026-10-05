import { describe, expect, it } from "vitest";
import { getErrorMessage, safeRedirectPath, toDate } from "./utils";

describe("safeRedirectPath", () => {
  it("keeps same-site paths", () => {
    expect(safeRedirectPath("/messages?user=1")).toBe("/messages?user=1");
    expect(safeRedirectPath("/")).toBe("/");
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["absolute URL", "https://evil.example"],
    ["protocol-relative", "//evil.example"],
    ["backslash trick", "/\\evil.example"],
    ["javascript:", "javascript:alert(1)"],
    ["relative", "messages"],
  ])("sends %s values home", (_label, value) => {
    expect(safeRedirectPath(value)).toBe("/");
  });
});

describe("getErrorMessage", () => {
  it("reads Error, Supabase-style objects and anything else", () => {
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage({ message: "row violates policy" })).toBe("row violates policy");
    expect(getErrorMessage(42)).toBe("42");
  });
});

describe("toDate", () => {
  it("parses timestamps and treats null as now", () => {
    expect(toDate("2026-01-02T03:04:05Z").toISOString()).toBe("2026-01-02T03:04:05.000Z");
    expect(Math.abs(toDate(null).getTime() - Date.now())).toBeLessThan(1000);
  });
});
