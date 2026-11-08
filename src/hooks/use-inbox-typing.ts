import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** How long "typing…" stays up without another signal (a stop signal clears it sooner). */
const STALE_MS = 6000;

/**
 * "typing…" in the chat list, as on WhatsApp. Each person listens on their own small inbox
 * channel; whoever is typing to them sends a start or stop note there. A broadcast, so nothing
 * is stored, and one channel per person rather than one per conversation.
 */
export function useInboxTyping(currentUserId: string | null) {
  const [typingFrom, setTypingFrom] = useState<Record<string, number>>({});
  const outbox = useRef(new Map<string, ReturnType<typeof supabase.channel>>());

  useEffect(() => {
    if (!currentUserId) return;
    const channel = supabase
      .channel(`inbox-${currentUserId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const from = (payload as { from?: string; typing?: boolean })?.from;
        if (!from || from === currentUserId) return;
        setTypingFrom((m) => {
          const next = { ...m };
          if ((payload as { typing?: boolean }).typing) next[from] = Date.now();
          else delete next[from];
          return next;
        });
      })
      .subscribe();
    // Drop anyone who went quiet without a stop (closed the app mid-sentence).
    const sweep = window.setInterval(() => {
      setTypingFrom((m) => {
        const now = Date.now();
        const stale = Object.entries(m).filter(([, at]) => now - at > STALE_MS);
        if (!stale.length) return m;
        const next = { ...m };
        for (const [id] of stale) delete next[id];
        return next;
      });
    }, 2000);
    const sent = outbox.current;
    return () => {
      window.clearInterval(sweep);
      supabase.removeChannel(channel);
      for (const c of sent.values()) supabase.removeChannel(c);
      sent.clear();
    };
  }, [currentUserId]);

  /** Tell `to` that you started or stopped typing to them. */
  const announce = useCallback((to: string, typing: boolean) => {
    if (!currentUserId) return;
    let channel = outbox.current.get(to);
    if (!channel) {
      channel = supabase.channel(`inbox-${to}`);
      channel.subscribe();
      outbox.current.set(to, channel);
    }
    void channel.send({ type: "broadcast", event: "typing", payload: { from: currentUserId, typing } });
  }, [currentUserId]);

  const isTyping = useCallback((userId: string) => userId in typingFrom, [typingFrom]);
  return { isTyping, announce };
}
