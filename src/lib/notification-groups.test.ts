import { describe, expect, it } from "vitest";
import { groupMessage, groupNotifications, type GroupableNotification } from "./notification-groups";

const n = (id: string, type: string, actor: string, related: string | null, read = true): GroupableNotification => ({
  id,
  type,
  content: `${actor} ${type === "like" ? "liked your post" : type === "comment" ? "commented on your post" : "sent you a friend request"}`,
  read,
  created_at: "2026-10-07T10:00:00Z",
  related_id: related,
  actor_id: actor.toLowerCase(),
  actor_profile: { full_name: actor, avatar_url: null },
});

describe("grouped notifications", () => {
  it("folds likes on the same post into one, newest person first", () => {
    const groups = groupNotifications([
      n("1", "like", "Alice", "p1"),
      n("2", "like", "Bob", "p1", false),
      n("3", "like", "Carol", "p1"),
      n("4", "like", "Dave", "p2"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].memberIds).toEqual(["1", "2", "3"]);
    expect(groups[0].read).toBe(false);
    expect(groupMessage(groups[0])).toBe("Alice and 2 others liked your post");
    expect(groupMessage(groups[1])).toBe("Dave liked your post");
  });

  it("names both people when there are two, and counts each person once", () => {
    const groups = groupNotifications([
      n("1", "comment", "Alice", "p1"),
      n("2", "comment", "Bob", "p1"),
      n("3", "comment", "Alice", "p1"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groupMessage(groups[0])).toBe("Alice and Bob commented on your post");
  });

  it("keeps different kinds and friend requests apart", () => {
    const groups = groupNotifications([
      n("1", "like", "Alice", "p1"),
      n("2", "comment", "Alice", "p1"),
      n("3", "friend_request", "Bob", "f1"),
      n("4", "friend_request", "Carol", "f2"),
    ]);
    expect(groups).toHaveLength(4);
  });
});
