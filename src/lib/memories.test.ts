import { describe, expect, it } from "vitest";
import { onThisDayRanges, yearsAgo } from "./memories";

describe("on this day", () => {
  it("gives the same day in each past year", () => {
    const ranges = onThisDayRanges(new Date(2026, 10, 8, 15, 0), 3);
    expect(ranges.map((r) => r.year)).toEqual([2025, 2024, 2023]);
    for (const r of ranges) {
      const from = new Date(r.from);
      expect(from.getMonth()).toBe(10);
      expect(from.getDate()).toBe(8);
      expect(new Date(r.to).getTime() - from.getTime()).toBeGreaterThanOrEqual(23 * 3600e3);
    }
  });
  it("skips years without 29 February", () => {
    expect(onThisDayRanges(new Date(2028, 1, 29), 4).map((r) => r.year)).toEqual([2024]);
  });
  it("says how long ago", () => {
    expect(yearsAgo(2025, new Date(2026, 0, 1))).toBe("1 year ago today");
    expect(yearsAgo(2023, new Date(2026, 0, 1))).toBe("3 years ago today");
  });
});
