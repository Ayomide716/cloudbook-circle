import { describe, expect, it } from "vitest";
import { compactCount, lastSeen, shortTime } from "./time";

const now = new Date("2026-10-05T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("shortTime", () => {
  it.each([
    [ago(20_000), "Just now"],
    [ago(5 * 60_000), "5m"],
    [ago(9 * 3600_000), "9h"],
    [ago(3 * 86400_000), "3d"],
  ])("formats %s as %s", (date, expected) => {
    expect(shortTime(date, now)).toBe(expected);
  });

  it("shows the date after a week, with the year only when it differs", () => {
    expect(shortTime(new Date("2026-09-20T10:00:00Z"), now)).toBe("Sep 20");
    expect(shortTime(new Date("2025-09-20T10:00:00Z"), now)).toBe("Sep 20, 2025");
  });

  it("is empty without a date", () => {
    expect(shortTime(null, now)).toBe("");
  });
});

describe("compactCount", () => {
  it.each([
    [0, "0"],
    [99, "99"],
    [999, "999"],
    [1000, "1K"],
    [2100, "2.1K"],
    [15_400, "15K"],
    [3_000_000, "3M"],
    [1_250_000, "1.3M"],
  ])("formats %i as %s", (n, expected) => {
    expect(compactCount(n)).toBe(expected);
  });
});

describe("lastSeen", () => {
  const now = new Date("2026-10-11T12:00:00Z");
  it("is short enough for a chat header", () => {
    expect(lastSeen(new Date("2026-10-11T11:59:40Z"), now)).toBe("Active just now");
    expect(lastSeen(new Date("2026-10-11T11:55:00Z"), now)).toBe("Active 5m ago");
    expect(lastSeen(new Date("2026-10-11T09:00:00Z"), now)).toBe("Active 3h ago");
    expect(lastSeen(new Date("2026-10-10T08:00:00Z"), now)).toBe("Last seen yesterday");
    expect(lastSeen(new Date("2026-10-03T08:00:00Z"), now)).toBe("Last seen Oct 3");
  });
});
