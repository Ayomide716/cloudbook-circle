import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { freshChannel } from "@/lib/realtime-broadcast";

export interface GroupCallParticipant {
  userId: string;
  name: string;
  avatar: string | null;
  video: boolean;
  audio: boolean;
}

/**
 * Watches who is in a group's call or voice room (the call's Realtime presence) without joining it,
 * so the group page can show "call in progress · Join".
 */
export function useGroupCallParticipants(groupId: string | undefined, enabled: boolean) {
  const [participants, setParticipants] = useState<GroupCallParticipant[]>([]);

  useEffect(() => {
    setParticipants([]);
    if (!groupId || !enabled) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    freshChannel(`group-call-${groupId}`).then((ch) => {
      if (cancelled) {
        supabase.removeChannel(ch);
        return;
      }
      channel = ch;
      ch.on("presence", { event: "sync" }, () => {
        const state = ch.presenceState<{ name: string; avatar: string | null; video: boolean; audio: boolean }>();
        setParticipants(
          Object.entries(state).map(([userId, metas]) => {
            const m = metas[metas.length - 1];
            return { userId, name: m.name, avatar: m.avatar, video: m.video, audio: m.audio };
          })
        );
      }).subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [groupId, enabled]);

  return participants;
}
