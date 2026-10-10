import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PostComment } from "@/components/PostCard";

export interface PostReactions {
  reactions: Record<string, number>;
  userReaction: string | null;
  /** Someone else who reacted, for "Ada Obi and 12 others" (as on Instagram and Facebook). */
  firstReactor?: string | null;
}
export type ReactionsMap = Record<string, PostReactions>;
export type CommentsMap = Record<string, PostComment[]>;

/** Reactions and comments for a set of posts, in two queries. */
export async function fetchPostInteractions(postIds: string[], userId: string) {
  const reactions: ReactionsMap = {};
  const comments: CommentsMap = {};
  if (postIds.length === 0) return { reactions, comments };

  const [{ data: reactRows }, { data: commentRows }] = await Promise.all([
    supabase.from("reactions").select("post_id, user_id, reaction_type").in("post_id", postIds),
    supabase
      .from("comments")
      .select(`*, profiles:user_id (id, full_name, avatar_url)`)
      .in("post_id", postIds)
      .order("created_at", { ascending: true }),
  ]);

  // One other person per post to name, all looked up in a single query.
  const firstOther = new Map<string, string>();
  for (const r of reactRows ?? []) {
    if (r.user_id !== userId && !firstOther.has(r.post_id)) firstOther.set(r.post_id, r.user_id);
  }
  const otherIds = [...new Set(firstOther.values())];
  const { data: people } = otherIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", otherIds)
    : { data: [] };
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));

  for (const id of postIds) {
    const counts: Record<string, number> = {};
    let mine: string | null = null;
    for (const r of reactRows ?? []) {
      if (r.post_id !== id) continue;
      counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1;
      if (r.user_id === userId) mine = r.reaction_type;
    }
    const other = firstOther.get(id);
    reactions[id] = { reactions: counts, userReaction: mine, firstReactor: other ? names.get(other) ?? null : null };
    comments[id] = (commentRows ?? []).filter((c) => c.post_id === id);
  }
  return { reactions, comments };
}

/** Same rule PostCard uses when saving: tapping your reaction removes it, another one replaces it. */
export function applyReactionToggle(entry: PostReactions | undefined, type: string): PostReactions {
  const counts = { ...(entry?.reactions ?? {}) };
  const previous = entry?.userReaction ?? null;
  if (previous) counts[previous] = Math.max(0, (counts[previous] || 1) - 1);
  if (previous !== type) counts[type] = (counts[type] || 0) + 1;
  return { ...entry, reactions: counts, userReaction: previous === type ? null : type };
}

/**
 * Reaction and comment state for any list of posts. PostCard saves the change to the
 * database itself; pages use `toggleReaction` and `reloadComments` to show it at once.
 */
export function usePostInteractions() {
  const [reactionsData, setReactionsData] = useState<ReactionsMap>({});
  const [commentsData, setCommentsData] = useState<CommentsMap>({});

  const toggleReaction = useCallback((postId: string, type: string) => {
    setReactionsData((prev) => ({ ...prev, [postId]: applyReactionToggle(prev[postId], type) }));
  }, []);

  const reloadComments = useCallback(async (postId: string) => {
    const { data } = await supabase
      .from("comments")
      .select(`*, profiles:user_id (id, full_name, avatar_url)`)
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (data) setCommentsData((prev) => ({ ...prev, [postId]: data }));
  }, []);

  return { reactionsData, setReactionsData, commentsData, setCommentsData, toggleReaction, reloadComments };
}
