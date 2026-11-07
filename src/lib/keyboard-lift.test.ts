import { describe, expect, it } from "vitest";
import { keyboardLift } from "./keyboard-lift";

describe("keyboardLift", () => {
  it("lifts by the whole keyboard when the app wasn't made shorter", () => {
    expect(keyboardLift(300, 800, 800)).toBe(300);
  });
  it("doesn't lift twice when Android already shrank the app", () => {
    expect(keyboardLift(300, 800, 500)).toBe(0);
  });
  it("lifts by the part Android didn't take off (e.g. the navigation bar)", () => {
    expect(keyboardLift(340, 800, 500)).toBe(40);
  });
  it("is zero with the keyboard closed", () => {
    expect(keyboardLift(0, 800, 800)).toBe(0);
  });
});
