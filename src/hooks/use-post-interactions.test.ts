import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const { applyReactionToggle } = await import("./use-post-interactions");

describe("applyReactionToggle", () => {
  it("adds a reaction when you had none", () => {
    expect(applyReactionToggle(undefined, "like")).toEqual({ reactions: { like: 1 }, userReaction: "like" });
  });

  it("removes your reaction when you tap it again", () => {
    expect(applyReactionToggle({ reactions: { like: 3 }, userReaction: "like" }, "like")).toEqual({
      reactions: { like: 2 },
      userReaction: null,
    });
  });

  it("switches from one reaction to another", () => {
    expect(applyReactionToggle({ reactions: { like: 1, love: 2 }, userReaction: "like" }, "love")).toEqual({
      reactions: { like: 0, love: 3 },
      userReaction: "love",
    });
  });

  it("never goes below zero", () => {
    expect(applyReactionToggle({ reactions: {}, userReaction: "like" }, "like").reactions.like).toBe(0);
  });
});
