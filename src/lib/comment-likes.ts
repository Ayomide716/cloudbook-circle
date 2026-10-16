/**
 * Likes on a post's comments ("Like" under each comment, with a count). One query for all of
 * a post's comments; liking updates at once and is saved in the background. Before the
 * database has comment_likes, `available` stays false and the Like button doesn't show.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CommentLikes {
  count: (commentId: string) => number;
  liked: (commentId: string) => boolean;
  /** The post's author liked this comment (a small heart, as on Facebook). */
  byAuthor: (commentId: string) => boolean;
  toggle: (commentId: string) => void;
}

export function useCommentLikes(commentIds: string[], userId: string | null | undefined, postAuthorId?: string | null): CommentLikes | null {
  const [rows, setRows] = useState<{ comment_id: string; user_id: string }[] | null>(null);
  const key = commentIds.join(",");

  useEffect(() => {
    if (!commentIds.length) { setRows([]); return; }
    let live = true;
    void supabase
      .from("comment_likes")
      .select("comment_id, user_id")
      .in("comment_id", commentIds)
      .then(({ data, error }) => { if (live) setRows(error ? null : data ?? []); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the ids themselves
  }, [key]);

  const toggle = useCallback((commentId: string) => {
    if (!userId || !rows) return;
    const mine = rows.some((r) => r.comment_id === commentId && r.user_id === userId);
    setRows((all) => (all ?? []).filter((r) => !(r.comment_id === commentId && r.user_id === userId)).concat(mine ? [] : [{ comment_id: commentId, user_id: userId }]));
    const undo = () => setRows((all) => mine ? [...(all ?? []), { comment_id: commentId, user_id: userId }] : (all ?? []).filter((r) => !(r.comment_id === commentId && r.user_id === userId)));
    const request = mine
      ? supabase.from("comment_likes").delete().eq("comment_id", commentId).eq("user_id", userId)
      : supabase.from("comment_likes").insert({ comment_id: commentId, user_id: userId });
    void request.then(({ error }) => { if (error) undo(); });
  }, [rows, userId]);

  return useMemo(() => {
    if (!rows) return null;
    return {
      count: (id) => rows.filter((r) => r.comment_id === id).length,
      liked: (id) => !!userId && rows.some((r) => r.comment_id === id && r.user_id === userId),
      byAuthor: (id) => !!postAuthorId && rows.some((r) => r.comment_id === id && r.user_id === postAuthorId),
      toggle,
    };
  }, [rows, userId, postAuthorId, toggle]);
}
