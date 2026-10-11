import { describe, expect, it } from "vitest";
import { groupColor, groupInitials } from "./group-tile";

describe("group tiles", () => {
  it("uses the first letters of the first two words", () => {
    expect(groupInitials("Lagos Developers")).toBe("LD");
    expect(groupInitials("The Squad 🏀")).toBe("TS");
    expect(groupInitials("Photography")).toBe("PH");
    expect(groupInitials("🎉")).toBe("?");
  });

  it("always gives a group the same colour", () => {
    expect(groupColor("abc")).toBe(groupColor("abc"));
  });
});
