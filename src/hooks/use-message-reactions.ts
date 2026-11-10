import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ChatReaction } from "@/lib/chat-reactions";
import { dbChannel } from "@/lib/realtime";

/**
 * Reactions on one-to-one chat messages, shared by every message on screen: one live
 * connection for all of them (not one per message), and the messages' reactions fetched
 * together in one request.
 */
const byMessage = new Map<string, ChatReaction[]>();
const listeners = new Map<string, Set<() => void>>();
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let channel: ReturnType<typeof dbChannel> | null = null;

const notify = (id: string) => listeners.get(id)?.forEach((fn) => fn());

/** Fetches the reactions of these messages (a few at a time, so each address stays short). */
async function load(ids: string[]) {
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await supabase.from("message_reactions").select("message_id, user_id, reaction_type").in("message_id", chunk);
    if (error) continue;
    for (const id of chunk) byMessage.set(id, (data ?? []).filter((r) => r.message_id === id));
    chunk.forEach(notify);
  }
}

function requestLoad(id: string) {
  pending.add(id);
  if (timer) return;
  timer = setTimeout(() => {
    const ids = [...pending];
    pending = new Set();
    timer = null;
    void load(ids);
  }, 40);
}

/** One live connection for all reactions you can see; a change reloads that message's. */
function watch() {
  if (channel) return;
  channel = dbChannel("message-reactions")
    .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, (payload) => {
      const row = (payload.new && "message_id" in payload.new ? payload.new : payload.old) as Partial<ChatReaction>;
      if (row.message_id && listeners.has(row.message_id)) void load([row.message_id]);
      else if (!row.message_id) void load([...listeners.keys()]); // a deletion without the row: reload what's on screen
    })
    .subscribe();
}
function unwatchIfIdle() {
  if (listeners.size || !channel) return;
  void supabase.removeChannel(channel);
  channel = null;
}

/**
 * The reactions on one message in a one-to-one chat, kept live, and a way to set yours
 * (picking the one you already have takes it off).
 */
export function useMessageReactions(messageId: string, currentUserId: string) {
  const temp = messageId.startsWith("temp-");
  const [reactions, setReactions] = useState<ChatReaction[]>(() => byMessage.get(messageId) ?? []);

  useEffect(() => {
    if (temp) return;
    const update = () => setReactions(byMessage.get(messageId) ?? []);
    const set = listeners.get(messageId) ?? new Set();
    set.add(update);
    listeners.set(messageId, set);
    watch();
    if (byMessage.has(messageId)) update();
    requestLoad(messageId);
    return () => {
      set.delete(update);
      if (!set.size) listeners.delete(messageId);
      unwatchIfIdle();
    };
  }, [messageId, temp]);

  const mine = reactions.find((r) => r.user_id === currentUserId)?.reaction_type ?? null;

  const react = async (type: string | null) => {
    if (temp) return;
    const next = type === mine ? null : type;
    // Show it straight away; the live update confirms it.
    byMessage.set(messageId, [
      ...reactions.filter((r) => r.user_id !== currentUserId),
      ...(next ? [{ message_id: messageId, user_id: currentUserId, reaction_type: next }] : []),
    ]);
    notify(messageId);
    if (mine) await supabase.from("message_reactions").delete().eq("message_id", messageId).eq("user_id", currentUserId);
    if (next) await supabase.from("message_reactions").insert({ message_id: messageId, user_id: currentUserId, reaction_type: next });
    void load([messageId]);
  };

  return { reactions, mine, react };
}
