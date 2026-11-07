import { describe, expect, it } from "vitest";
import { friendlyError, getErrorMessage, safeRedirectPath, toDate } from "./utils";

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

describe("friendlyError", () => {
  it("puts database and network errors in plain words", () => {
    expect(friendlyError({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" })).toBe("We couldn't find that. It may have been deleted.");
    expect(friendlyError(new TypeError("Failed to fetch"))).toBe("Couldn't connect. Check your connection and try again.");
    expect(friendlyError({ code: "42501", message: "new row violates row-level security policy" })).toBe("You can't do that here.");
    expect(friendlyError({ code: "22P02", message: "invalid input syntax for type uuid" })).toBe("Something went wrong on our side. Please try again.");
  });
  it("keeps messages that are already written for people", () => {
    expect(friendlyError(new Error("Couldn't upload. Uploads are paused."))).toBe("Couldn't upload. Uploads are paused.");
    expect(friendlyError({ message: "Invalid login credentials", code: "invalid_credentials" })).toBe("Invalid login credentials");
  });
});
