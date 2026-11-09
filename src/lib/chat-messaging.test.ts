import { describe, expect, it } from "vitest";
import { groupAlbums } from "./chat-albums";
import { limiter, mediaSize, settleSent, withMediaSize } from "./chat-media";
import { emojiOnlyCount } from "./emoji-only";
import { storyReplyImage, storyReplyOf } from "./story-reply";
import type { ChatMessage } from "@/components/ChatBubble";

const msg = (id: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id, sender_id: "a", receiver_id: "b", content: "Sent an image", created_at: new Date(Date.parse("2026-11-09T10:00:00Z") + Number(id.replace(/\D/g, "") || 0) * 1000).toISOString(),
  read: false, image_url: `https://x/${id}.jpg`, ...extra,
});

describe("albums", () => {
  it("groups 4+ photos sent together, not 3", () => {
    expect(groupAlbums([msg("1"), msg("2"), msg("3")]).length).toBe(3);
    const rows = groupAlbums([msg("1", { content: "Beach day" }), msg("2"), msg("3"), msg("4"), msg("5", { content: "hi", image_url: null })]);
    expect(rows.length).toBe(2);
    expect(rows[0].album?.length).toBe(4);
  });
  it("doesn't mix senders", () => {
    expect(groupAlbums([msg("1"), msg("2"), msg("3", { sender_id: "b" }), msg("4"), msg("5")]).every((r) => !r.album)).toBe(true);
  });
});

describe("sending", () => {
  it("keeps a photo's size after #", () => {
    const url = withMediaSize("https://x/a.jpg", 1080, 1440);
    expect(url).toBe("https://x/a.jpg#w=1080&h=1440");
    expect(mediaSize(url)).toEqual({ w: 1080, h: 1440 });
    expect(mediaSize("https://x/a.jpg")).toBeNull();
  });
  it("puts the saved message in its placeholder's place, keeping the photo on screen", () => {
    const prev = [msg("temp-1", { _status: "sending", _preview: "blob:1" }), msg("temp-2", { _status: "sending", _preview: "blob:2" })];
    const next = settleSent(prev, msg("9"));
    expect(next.map((m) => m.id)).toEqual(["9", "temp-2"]);
    expect(next[0]._preview).toBe("blob:1");
    // Arriving again (live update after the insert): no duplicate.
    expect(settleSent(next, msg("9")).length).toBe(2);
  });
  it("runs at most n jobs at once", async () => {
    const run = limiter(2);
    let active = 0;
    let most = 0;
    await Promise.all([1, 2, 3, 4, 5].map(() => run(async () => { active++; most = Math.max(most, active); await new Promise((r) => setTimeout(r, 5)); active--; })));
    expect(most).toBe(2);
  });
});

describe("emoji only", () => {
  it("counts 1-3 emoji and nothing else", () => {
    expect(emojiOnlyCount("🔥")).toBe(1);
    expect(emojiOnlyCount("🔥 😂")).toBe(2);
    expect(emojiOnlyCount("👍🏽❤️🇳🇬")).toBe(3);
    expect(emojiOnlyCount("🔥😂😂😂")).toBe(0);
    expect(emojiOnlyCount("ok 🔥")).toBe(0);
    expect(emojiOnlyCount("123")).toBe(0);
  });
});

describe("story replies", () => {
  it("carries the story's picture", () => {
    const m = { content: '💬 Replied to your story: "so nice"', image_url: storyReplyImage("https://x/s.jpg", "image") };
    expect(storyReplyOf(m)).toEqual({ image: "https://x/s.jpg", video: false, text: "so nice", reaction: false });
    expect(storyReplyOf({ content: "❤️ Reacted to your story", image_url: null })?.reaction).toBe(true);
    expect(storyReplyOf({ content: "hello" })).toBeNull();
  });
});
