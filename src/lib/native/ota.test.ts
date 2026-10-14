import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import { shellLevelFrom, updateFor } from "./ota";

const sum = "a".repeat(64);

describe("over-the-air updates", () => {
  const site = "https://ember.example";

  it("offers a newer version with its full download address", () => {
    expect(updateFor({ version: "b2", url: "/ota/b2.zip", checksum: sum, nativeLevel: 1 }, "a1", 1, site)).toEqual({ version: "b2", url: "https://ember.example/ota/b2.zip", checksum: sum });
  });

  it("does nothing when already on that version", () => {
    expect(updateFor({ version: "a1", url: "/ota/a1.zip", checksum: sum, nativeLevel: 1 }, "a1", 1, site)).toBeNull();
  });

  it("waits for a new APK when the version needs newer native parts", () => {
    expect(updateFor({ version: "b2", url: "/ota/b2.zip", checksum: sum, nativeLevel: 2 }, "a1", 1, site)).toBeNull();
  });

  it("ignores broken or unsafe manifests", () => {
    expect(updateFor(null, "a1", 1, site)).toBeNull();
    // The updater refuses downloads without the zip's SHA-256.
    expect(updateFor({ version: "b2", url: "/ota/b2.zip", nativeLevel: 1 }, "a1", 1, site)).toBeNull();
    expect(updateFor({ version: "b2" }, "a1", 1, site)).toBeNull();
    expect(updateFor({ version: "b2", url: "http://evil.example/x.zip", checksum: sum, nativeLevel: 1 }, "a1", 1, site)).toBeNull();
    expect(updateFor({ version: "b2", url: "ota/b2.zip", checksum: sum, nativeLevel: 1 }, "a1", 1, site)).toBeNull();
  });

  it("reads the native level from the APK's version name", () => {
    expect(shellLevelFrom("1.3.57")).toBe(3);
    expect(shellLevelFrom("1.0")).toBe(1);
    expect(shellLevelFrom(undefined)).toBe(1);
  });
});
