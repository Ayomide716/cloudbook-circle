import { describe, expect, it } from "vitest";
import { isBirthdayToday } from "@/lib/birthdays";

describe("isBirthdayToday", () => {
  const oct15 = new Date(2026, 9, 15, 12);
  it("matches month and day, any year", () => {
    expect(isBirthdayToday("1998-10-15", oct15)).toBe(true);
    expect(isBirthdayToday("1998-10-16", oct15)).toBe(false);
    expect(isBirthdayToday(null, oct15)).toBe(false);
  });
  it("celebrates 29 February on 28 February outside leap years", () => {
    expect(isBirthdayToday("2000-02-29", new Date(2027, 1, 28, 12))).toBe(true);
    expect(isBirthdayToday("2000-02-29", new Date(2028, 1, 28, 12))).toBe(false);
    expect(isBirthdayToday("2000-02-29", new Date(2028, 1, 29, 12))).toBe(true);
  });
});
