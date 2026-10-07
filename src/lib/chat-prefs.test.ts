import { describe, expect, it, beforeEach } from "vitest";
import { readChatPrefs, toggleChatPref } from "./chat-prefs";

describe("chat prefs", () => {
  beforeEach(() => localStorage.clear());

  it("adds and removes a chat from a list", () => {
    const empty = readChatPrefs("me");
    const pinned = toggleChatPref(empty, "pinned", "alice");
    expect(pinned.pinned).toEqual(["alice"]);
    expect(toggleChatPref(pinned, "pinned", "alice").pinned).toEqual([]);
    expect(pinned.muted).toEqual([]);
  });

  it("reads nothing for a signed-out user or broken storage", () => {
    expect(readChatPrefs(null)).toEqual({ pinned: [], muted: [], archived: [] });
    localStorage.setItem("cloudbook_chat_prefs_me", "{not json");
    expect(readChatPrefs("me")).toEqual({ pinned: [], muted: [], archived: [] });
  });
});
