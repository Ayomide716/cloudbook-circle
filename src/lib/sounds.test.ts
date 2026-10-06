import { beforeEach, describe, expect, it } from "vitest";
import { playSound, setSoundsEnabled, soundsEnabled } from "./sounds";

describe("in-app sounds", () => {
  beforeEach(() => localStorage.clear());

  it("are on by default and can be turned off and on", () => {
    expect(soundsEnabled()).toBe(true);
    setSoundsEnabled(false);
    expect(soundsEnabled()).toBe(false);
    setSoundsEnabled(true);
    expect(soundsEnabled()).toBe(true);
  });

  it("stay silent, without errors, where audio isn't available", () => {
    expect(() => playSound("notification")).not.toThrow();
  });
});
