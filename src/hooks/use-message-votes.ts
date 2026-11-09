import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dbChannel } from "@/lib/realtime";

export interface Vote { user_id: string; option: number }

/** The votes on a poll (or going / can't go on an event) in a chat, kept live. */
export function useMessageVotes(messageId: string, currentUserId: string) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const temp = messageId.startsWith("temp-");

  const load = useCallback(async () => {
    const { data } = await supabase.from("message_votes").select("user_id, option").eq("message_id", messageId);
    if (data) setVotes(data);
  }, [messageId]);

  useEffect(() => {
    if (temp) return;
    void load();
    const channel = dbChannel(`message-votes-${messageId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_votes", filter: `message_id=eq.${messageId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [messageId, temp, load]);

  const mine = votes.filter((v) => v.user_id === currentUserId).map((v) => v.option);

  /** Picks an option (or takes it back); with `single`, your other choice goes. */
  const vote = async (option: number, single: boolean) => {
    if (temp) return;
    const had = mine.includes(option);
    setVotes((prev) => [
      ...prev.filter((v) => v.user_id !== currentUserId || (!single && v.option !== option)),
      ...(had ? [] : [{ user_id: currentUserId, option }]),
    ]);
    if (had) await supabase.from("message_votes").delete().eq("message_id", messageId).eq("user_id", currentUserId).eq("option", option);
    else {
      if (single && mine.length) await supabase.from("message_votes").delete().eq("message_id", messageId).eq("user_id", currentUserId);
      await supabase.from("message_votes").insert({ message_id: messageId, user_id: currentUserId, option });
    }
    void load();
  };

  return { votes, mine, vote };
}
