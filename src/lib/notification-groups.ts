/**
 * Facebook-style grouping: likes (or comments, shares, reactions) on the same post become one
 * notification — "Alice Johnson and 3 others liked your post" — instead of one row each.
 */

export interface GroupableNotification {
  id: string;
  type: string;
  content: string;
  read: boolean | null;
  created_at: string | null;
  related_id: string | null;
  actor_id: string | null;
  actor_profile?: { full_name: string | null; avatar_url: string | null } | null;
}

export type NotificationGroup<T extends GroupableNotification> = T & {
  /** Ids of every notification folded into this one (marked read together). */
  memberIds: string[];
  /** The people involved, newest first, one entry each. */
  actors: { id: string | null; name: string; avatar_url: string | null }[];
};

const GROUPED_TYPES = new Set(["like", "comment", "share", "reaction"]);

const ACTIONS: Record<string, string> = {
  like: "liked your post",
  comment: "commented on your post",
  share: "shared your post",
  reaction: "reacted to your post",
};

/** The list is newest first; each group keeps the newest notification as its face. */
export function groupNotifications<T extends GroupableNotification>(list: T[]): NotificationGroup<T>[] {
  const groups = new Map<string, NotificationGroup<T>>();
  for (const n of list) {
    // Identical copies (an old bug created some twice) always fold together.
    const key = GROUPED_TYPES.has(n.type) && n.related_id
      ? `${n.type}|${n.related_id}`
      : `${n.type}|${n.actor_id}|${n.related_id}|${n.content}`;
    const name = n.actor_profile?.full_name || "Someone";
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        ...n,
        memberIds: [n.id],
        actors: [{ id: n.actor_id, name, avatar_url: n.actor_profile?.avatar_url ?? null }],
      });
      continue;
    }
    group.memberIds.push(n.id);
    if (!n.read) group.read = false;
    if (!group.actors.some((a) => a.id === n.actor_id)) {
      group.actors.push({ id: n.actor_id, name, avatar_url: n.actor_profile?.avatar_url ?? null });
    }
  }
  return [...groups.values()];
}

/** "Alice liked your post", "Alice and Bob liked your post", "Alice and 3 others liked your post". */
export function groupMessage(group: NotificationGroup<GroupableNotification>): string {
  if (group.actors.length <= 1) return group.content;
  const lead = group.actors[0].name;
  const action = group.content.startsWith(`${lead} `)
    ? group.content.slice(lead.length + 1)
    : ACTIONS[group.type] ?? "interacted with your post";
  const others = group.actors.length - 1;
  return others === 1
    ? `${lead} and ${group.actors[1].name} ${action}`
    : `${lead} and ${others} others ${action}`;
}
