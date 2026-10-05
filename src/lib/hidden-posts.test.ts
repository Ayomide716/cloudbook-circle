import { beforeEach, describe, expect, it } from "vitest";
import { hidePost, isFilteredOut, snoozePerson, unhidePost, unsnoozePerson, SNOOZE_DAYS } from "./hidden-posts";

const post = (id: string, user_id: string) => ({ id, user_id });

describe("hidden posts and snoozed people", () => {
  beforeEach(() => {
    localStorage.clear();
    // Start each test from empty storage (the module caches what it read).
    unhidePost("__reset__");
  });

  it("leaves out a hidden post until it is unhidden", () => {
    expect(isFilteredOut(post("p1", "bob"))).toBe(false);
    hidePost("p1");
    expect(isFilteredOut(post("p1", "bob"))).toBe(true);
    expect(isFilteredOut(post("p2", "bob"))).toBe(false);
    unhidePost("p1");
    expect(isFilteredOut(post("p1", "bob"))).toBe(false);
  });

  it("leaves out everything from a snoozed person for 30 days, then lets it back", () => {
    const now = Date.now();
    snoozePerson("bob", now);
    expect(isFilteredOut(post("p1", "bob"), undefined, now + 1000)).toBe(true);
    expect(isFilteredOut(post("p1", "carol"), undefined, now + 1000)).toBe(false);
    expect(isFilteredOut(post("p1", "bob"), undefined, now + (SNOOZE_DAYS + 1) * 86400_000)).toBe(false);
    unsnoozePerson("bob");
    expect(isFilteredOut(post("p1", "bob"), undefined, now + 1000)).toBe(false);
  });

  it("survives a reload (stored on the device)", () => {
    hidePost("p9");
    expect(JSON.parse(localStorage.getItem("cloudbook_hidden_posts")!)).toEqual(["p9"]);
  });
});
