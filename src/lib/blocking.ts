import { supabase } from "@/integrations/supabase/client";

/**
 * Blocking. The database does the real work (see the block_users migration): once either
 * person blocks the other, their posts and comments disappear for each other and neither
 * can message, friend-request, comment on or react to the other.
 */
export async function blockUser(userId: string) {
  const { error } = await supabase.rpc("block_user", { _target: userId });
  if (error) throw error;
}

export async function unblockUser(blockerId: string, userId: string) {
  const { error } = await supabase.from("blocks").delete().eq("blocker_id", blockerId).eq("blocked_id", userId);
  if (error) throw error;
}

/** Whether you and this person have blocked each other, either way. */
export async function isBlockedWith(userId: string) {
  const { data } = await supabase.rpc("is_blocked_with", { _other: userId });
  return data === true;
}

/** People you've blocked, newest first. */
export async function myBlockedPeople(blockerId: string) {
  const { data, error } = await supabase
    .from("blocks")
    .select("blocked_id, created_at, profiles!blocks_blocked_id_fkey (id, full_name, avatar_url)")
    .eq("blocker_id", blockerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.blocked_id,
    full_name: row.profiles?.full_name ?? null,
    avatar_url: row.profiles?.avatar_url ?? null,
  }));
}

export const BLOCKED_ACTION_MESSAGE = "You can't do this: one of you has blocked the other.";

/** The text to show when saving something for/with this person failed: plain words if a block stopped it. */
export async function explainError(error: { message: string; code?: string }, otherUserId: string | null | undefined) {
  if (error.code === "42501" && otherUserId && await isBlockedWith(otherUserId)) return BLOCKED_ACTION_MESSAGE;
  return error.message;
}
