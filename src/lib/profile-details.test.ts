import { describe, expect, it } from "vitest";
import { birthdayLabel, relationshipLabel } from "./profile-details";

describe("profile details", () => {
  it("shows the birthday as month and day only", () => {
    expect(birthdayLabel("1998-12-15")).toBe("December 15");
    expect(birthdayLabel("2001-02-01")).toBe("February 1");
    expect(birthdayLabel(null)).toBeNull();
    expect(birthdayLabel("nonsense")).toBeNull();
  });

  it("labels relationship statuses", () => {
    expect(relationshipLabel("single")).toBe("Single");
    expect(relationshipLabel("its_complicated")).toBe("It's complicated");
    expect(relationshipLabel(null)).toBeNull();
  });
});
