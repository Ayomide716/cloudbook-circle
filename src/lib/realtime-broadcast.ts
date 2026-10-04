import { supabase } from "@/integrations/supabase/client";

export interface BroadcastMessage {
  topic: string;
  event: string;
  payload: Record<string, unknown>;
}

/**
 * Sends broadcasts to channels this client hasn't joined, in one HTTP request.
 * Used to ring people: their app listens on `calls-<their id>` wherever they are.
 */
export async function broadcast(
  messages: BroadcastMessage[],
  opts: { accessToken?: string; keepalive?: boolean } = {}
): Promise<boolean> {
  if (messages.length === 0) return true;
  const token = opts.accessToken ?? (await supabase.auth.getSession()).data.session?.access_token;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${token ?? key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: messages.map((m) => ({ ...m, private: false })) }),
      // Lets a hang-up still go out when the tab is being closed.
      keepalive: opts.keepalive,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const userCallTopic = (userId: string) => `calls-${userId}`;

/**
 * supabase.channel() hands back an existing channel with the same name, even one that is
 * still closing. Calls need their own, so remove any leftover first.
 */
export async function freshChannel(name: string, params?: Parameters<typeof supabase.channel>[1]) {
  const stale = supabase.getChannels().filter((c) => c.topic === `realtime:${name}`);
  await Promise.all(stale.map((c) => supabase.removeChannel(c)));
  return supabase.channel(name, params);
}
