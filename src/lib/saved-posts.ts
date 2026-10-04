import { supabase } from "@/integrations/supabase/client";

/**
 * "Is this post saved?" lookups from many PostCards rendered together are
 * collected for one tick and answered with a single query, instead of one
 * request per post.
 */
type Waiter = (saved: boolean) => void;
const queues = new Map<string, Map<string, Waiter[]>>(); // userId -> postId -> waiters

async function flush(userId: string) {
  const queue = queues.get(userId);
  queues.delete(userId);
  if (!queue) return;
  const postIds = [...queue.keys()];
  const { data } = await supabase
    .from("saved_posts")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);
  const saved = new Set((data ?? []).map((row) => row.post_id));
  queue.forEach((waiters, postId) => waiters.forEach((resolve) => resolve(saved.has(postId))));
}

export function isPostSaved(postId: string, userId: string): Promise<boolean> {
  return new Promise((resolve) => {
    let queue = queues.get(userId);
    if (!queue) {
      queue = new Map();
      queues.set(userId, queue);
      setTimeout(() => flush(userId), 0);
    }
    const waiters = queue.get(postId) ?? [];
    waiters.push(resolve);
    queue.set(postId, waiters);
  });
}
