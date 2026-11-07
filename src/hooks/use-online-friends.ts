import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OnlineFriend { id: string; full_name: string | null; avatar_url: string | null }

/** Online means the app said so in the last 5 minutes (the same rule as Contacts and Friends). */
const FRESH_MS = 5 * 60 * 1000;

/**
 * Friends who are online now, for "Active now" in Messages. Checked once a minute rather than
 * through a realtime channel on user_status, which fires for every user in the app.
 */
export function useOnlineFriends(currentUserId: string | null) {
  const [online, setOnline] = useState<OnlineFriend[]>([]);

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    const load = async () => {
      const { data: friendships } = await supabase
        .from("friendships")
        .select("user_id, friend_id")
        .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
        .eq("status", "accepted");
      const ids = (friendships ?? []).map((f) => (f.user_id === currentUserId ? f.friend_id : f.user_id));
      if (!ids.length) { if (!cancelled) setOnline([]); return; }
      const { data: statuses } = await supabase.from("user_status").select("user_id, is_online, last_seen").in("user_id", ids);
      const onlineIds = (statuses ?? [])
        .filter((s) => s.is_online && Date.parse(s.last_seen) > Date.now() - FRESH_MS)
        .map((s) => s.user_id);
      const { data: profiles } = onlineIds.length
        ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", onlineIds)
        : { data: [] as OnlineFriend[] };
      if (!cancelled) setOnline((profiles ?? []).sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")));
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [currentUserId]);

  return online;
}
