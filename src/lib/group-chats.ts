import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Your groups as chats, for the Messages list (as WhatsApp lists groups with people): each
 * with its latest message and how many messages arrived since you last opened it, plus the
 * group invites waiting for you.
 */

export interface GroupInfo {
  id: string;
  name: string;
  /** A group chat (made in Messages) rather than a community group (the Groups tab). */
  is_chat?: boolean;
  image_url: string | null;
  description: string | null;
  created_by: string;
  created_at: string;
}

export interface GroupChatSummary {
  group: GroupInfo;
  lastMessage: { content: string; created_at: string; user_id: string; senderName: string | null } | null;
  unread: number;
  /** When you joined: groups with no messages yet sort by this. */
  joinedAt: string;
}

export interface GroupInvite {
  group: Pick<GroupInfo, "id" | "name" | "image_url" | "is_chat">;
  invitedBy: { id: string; full_name: string | null };
  created_at: string;
}

const seenKey = (userId: string) => `cloudbook_group_seen_${userId}`;

function readSeen(userId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(seenKey(userId)) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** Remembers that you've read a group's chat up to now (kept on this device). */
export function markGroupSeen(userId: string, groupId: string) {
  try {
    const seen = readSeen(userId);
    seen[groupId] = new Date().toISOString();
    localStorage.setItem(seenKey(userId), JSON.stringify(seen));
  } catch { /* storage blocked: the count just won't remember */ }
}

/** The time a group chat was last active, for sorting the chat list. */
export const groupActivity = (g: GroupChatSummary) => g.lastMessage?.created_at ?? g.joinedAt;

export function useGroupChats(userId: string | null) {
  const [groups, setGroups] = useState<GroupChatSummary[]>([]);
  const [invites, setInvites] = useState<GroupInvite[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data: memberships } = await supabase
      .from("group_members")
      // Every column, so this still works before the group-chats database update adds is_chat.
      .select("joined_at, groups (*)")
      .eq("user_id", userId);
    // Only group chats belong in Messages; community groups stay on the Groups tab.
    const mine = ((memberships ?? []).filter((m) => m.groups) as unknown as { joined_at: string; groups: GroupInfo }[])
      .filter((m) => m.groups.is_chat === true);
    const ids = mine.map((m) => m.groups.id);

    // Recent messages across your groups: enough to find each one's latest and count new ones.
    const { data: recent } = ids.length
      ? await supabase
          .from("group_messages")
          .select("group_id, user_id, content, created_at")
          .in("group_id", ids)
          .order("created_at", { ascending: false })
          .limit(Math.min(1000, ids.length * 60))
      : { data: [] };
    const senderIds = [...new Set((recent ?? []).map((m) => m.user_id))];
    const { data: senders } = senderIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", senderIds)
      : { data: [] };
    const names = new Map((senders ?? []).map((p) => [p.id, p.full_name]));
    const seen = readSeen(userId);

    setGroups(
      mine.map(({ joined_at, groups: group }) => {
        const msgs = (recent ?? []).filter((m) => m.group_id === group.id);
        const last = msgs[0];
        const since = seen[group.id] ?? joined_at;
        return {
          group,
          joinedAt: joined_at,
          lastMessage: last ? { ...last, senderName: names.get(last.user_id) ?? null } : null,
          unread: msgs.filter((m) => m.user_id !== userId && m.created_at > since).length,
        };
      })
    );

    // Invites waiting for you (the table only exists after the invites database update).
    const { data: inviteRows, error } = await supabase
      .from("group_invites")
      .select("created_at, invited_by, groups (*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) { setInvites([]); return; }
    const inviterIds = [...new Set((inviteRows ?? []).map((i) => i.invited_by))];
    const { data: inviters } = inviterIds.length
      ? await supabase.from("profiles").select("id, full_name").in("id", inviterIds)
      : { data: [] };
    setInvites(
      (inviteRows ?? [])
        .filter((i) => i.groups)
        .map((i) => ({
          group: i.groups as unknown as GroupInvite["group"],
          invitedBy: { id: i.invited_by, full_name: (inviters ?? []).find((p) => p.id === i.invited_by)?.full_name ?? null },
          created_at: i.created_at,
        }))
    );
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void load();
    // New group messages (only ones from your groups reach you), joining or leaving, invites.
    const channel = supabase
      .channel(`group-chats-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: `user_id=eq.${userId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "group_invites", filter: `user_id=eq.${userId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, load]);

  const markSeen = useCallback((groupId: string) => {
    if (!userId) return;
    markGroupSeen(userId, groupId);
    setGroups((list) => list.map((g) => (g.group.id === groupId ? { ...g, unread: 0 } : g)));
  }, [userId]);

  return { groups, invites, reload: load, markSeen };
}

/** A steady colour for each person's name in group chats, as WhatsApp does. */
const NAME_COLOURS = ["text-sky-400", "text-amber-400", "text-pink-400", "text-emerald-400", "text-violet-400", "text-orange-400", "text-cyan-400", "text-lime-400"];
export function nameColour(userId: string) {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return NAME_COLOURS[h % NAME_COLOURS.length];
}
