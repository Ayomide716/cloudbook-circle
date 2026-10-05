import { describe, expect, it } from "vitest";
import { PAGE_CATEGORIES, pageCategoryLabel } from "./page-categories";

describe("pageCategoryLabel", () => {
  it("uses the label for known categories", () => {
    for (const c of PAGE_CATEGORIES) expect(pageCategoryLabel(c.value)).toBe(c.label);
  });

  it("capitalises unknown ones instead of failing", () => {
    expect(pageCategoryLabel("gardening")).toBe("Gardening");
  });
});
