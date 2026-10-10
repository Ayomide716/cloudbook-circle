import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ChatReaction } from "@/lib/chat-reactions";
import { dbChannel } from "@/lib/realtime";

/**
 * The reactions on one message in a one-to-one chat, kept live, and a way to set yours
 * (picking the one you already have takes it off).
 */
export function useMessageReactions(messageId: string, currentUserId: string) {
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  const temp = messageId.startsWith("temp-");

  const load = useCallback(async () => {
    const { data } = await supabase.from("message_reactions").select("message_id, user_id, reaction_type").eq("message_id", messageId);
    if (data) setReactions(data);
  }, [messageId]);

  useEffect(() => {
    if (temp) return;
    void load();
    const channel = dbChannel(`message-reactions-${messageId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions", filter: `message_id=eq.${messageId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [messageId, temp, load]);

  const mine = reactions.find((r) => r.user_id === currentUserId)?.reaction_type ?? null;

  const react = async (type: string | null) => {
    if (temp) return;
    const next = type === mine ? null : type;
    // Show it straight away; the live update confirms it.
    setReactions((prev) => [
      ...prev.filter((r) => r.user_id !== currentUserId),
      ...(next ? [{ message_id: messageId, user_id: currentUserId, reaction_type: next }] : []),
    ]);
    if (mine) await supabase.from("message_reactions").delete().eq("message_id", messageId).eq("user_id", currentUserId);
    if (next) await supabase.from("message_reactions").insert({ message_id: messageId, user_id: currentUserId, reaction_type: next });
    void load();
  };

  return { reactions, mine, react };
}
