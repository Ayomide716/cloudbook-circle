import { supabase } from "@/integrations/supabase/client";
import { features } from "@/lib/features";

/**
 * Whether "last seen" is hidden between two people: either of them turned it off (Settings →
 * Chats), as on WhatsApp. Answers are kept for the session.
 */
const cache = new Map<string, Promise<boolean>>();

const hides = (id: string) => {
  if (!cache.has(id)) {
    cache.set(id, Promise.resolve(supabase.from("profiles").select("hide_last_seen").eq("id", id).maybeSingle()).then(({ data }) => !!data?.hide_last_seen, () => false));
  }
  return cache.get(id)!;
};

export async function lastSeenHidden(userId: string, viewerId?: string | null): Promise<boolean> {
  if (!features.messaging2) return false;
  const [theirs, mine] = await Promise.all([hides(userId), viewerId ? hides(viewerId) : Promise.resolve(false)]);
  return theirs || mine;
}

/** After changing your own setting. */
export const forgetLastSeen = (userId: string) => cache.delete(userId);
