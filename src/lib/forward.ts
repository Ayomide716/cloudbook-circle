import { supabase } from "@/integrations/supabase/client";

/** What gets forwarded: a message's text and its photo, video, GIF or voice note. */
export interface ForwardableMessage {
  content: string;
  image_url?: string | null;
}

/** Sends a message on to people and groups, marked "Forwarded". Returns how many failed. */
export async function forwardMessage(message: ForwardableMessage, targets: { kind: "dm" | "group"; id: string }[], currentUserId: string) {
  let failed = 0;
  for (const t of targets) {
    const base = { content: message.content, image_url: message.image_url ?? null };
    const send = (extra: { forwarded?: boolean }) =>
      t.kind === "dm"
        ? supabase.from("messages").insert({ ...base, ...extra, sender_id: currentUserId, receiver_id: t.id })
        : supabase.from("group_messages").insert({ ...base, ...extra, user_id: currentUserId, group_id: t.id });
    let { error } = await send({ forwarded: true });
    // Before the database update there's no "forwarded" mark: send it plain.
    if (error && /forwarded/.test(error.message)) ({ error } = await send({}));
    if (error) failed++;
  }
  return failed;
}
