import { describe, expect, it, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { readDraft, saveDraft, useDraft } from "./chat-drafts";

const useBox = (chatId: string, editing = false) => {
  const [text, setText] = useState("");
  useDraft("me", chatId, text, setText, editing);
  return { text, setText };
};

describe("chat drafts", () => {
  beforeEach(() => localStorage.clear());

  it("keeps what you typed in a chat and puts it back when you return", () => {
    const { result, rerender } = renderHook(({ chat }) => useBox(chat), { initialProps: { chat: "ada" } });
    act(() => result.current.setText("half a thought"));
    expect(readDraft("me", "ada")).toBe("half a thought");

    rerender({ chat: "bola" });
    expect(result.current.text).toBe("");
    expect(readDraft("me", "ada")).toBe("half a thought");

    rerender({ chat: "ada" });
    expect(result.current.text).toBe("half a thought");
  });

  it("forgets the draft once the box is emptied (sent)", () => {
    saveDraft("me", "ada", "hello");
    const { result } = renderHook(() => useBox("ada"));
    expect(result.current.text).toBe("hello");
    act(() => result.current.setText(""));
    expect(readDraft("me", "ada")).toBe("");
  });

  it("leaves the draft alone while editing a sent message, then brings it back", () => {
    saveDraft("me", "ada", "my draft");
    const { result, rerender } = renderHook(({ editing }) => useBox("ada", editing), { initialProps: { editing: false } });
    rerender({ editing: true });
    act(() => result.current.setText("the old message, edited"));
    expect(readDraft("me", "ada")).toBe("my draft");
    act(() => result.current.setText(""));
    rerender({ editing: false });
    expect(result.current.text).toBe("my draft");
  });
});
