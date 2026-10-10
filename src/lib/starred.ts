import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Starred messages, as on WhatsApp: your own bookmarks, kept with your account. Every chat on
 * screen shares one list, so a star shows up everywhere as soon as it's added.
 */
export type ChatKind = "dm" | "group";

let cache: { userId: string; ids: Map<string, ChatKind> } | null = null;
let loading: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();
const notify = () => { version++; listeners.forEach((l) => l()); };

async function load(userId: string) {
  const { data, error } = await supabase.from("starred_messages").select("message_id, chat_kind").eq("user_id", userId);
  // Before the database update there are simply no stars.
  cache = { userId, ids: new Map(error ? [] : (data ?? []).map((r) => [r.message_id, r.chat_kind as ChatKind])) };
  notify();
}

export function useStarred(userId: string | null | undefined) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const rerender = () => setTick((t) => t + 1);
    listeners.add(rerender);
    if (cache?.userId !== userId && !loading) loading = load(userId).finally(() => { loading = null; });
    return () => { listeners.delete(rerender); };
  }, [userId]);

  const ids = cache && cache.userId === userId ? cache.ids : new Map<string, ChatKind>();

  const toggle = useCallback(async (messageId: string, kind: ChatKind): Promise<string | null> => {
    if (!userId || !cache || cache.userId !== userId) return "Not ready yet";
    const had = cache.ids.has(messageId);
    if (had) cache.ids.delete(messageId); else cache.ids.set(messageId, kind);
    notify();
    const { error } = had
      ? await supabase.from("starred_messages").delete().eq("user_id", userId).eq("message_id", messageId)
      : await supabase.from("starred_messages").insert({ user_id: userId, message_id: messageId, chat_kind: kind });
    if (error) {
      if (had) cache.ids.set(messageId, kind); else cache.ids.delete(messageId);
      notify();
      return /starred_messages/.test(error.message) ? "This needs the latest database update." : error.message;
    }
    return null;
  }, [userId]);

  // `version` changes whenever a star is added or removed (the list itself is reused).
  return { starred: ids, version, isStarred: (id: string) => ids.has(id), toggle };
}
