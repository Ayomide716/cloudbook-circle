import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRingtone } from "./useRingtone";

interface CallRequest {
  from: string;
  fromName: string;
  fromAvatar?: string | null;
  isVoiceOnly?: boolean;
}

export const useVideoCall = (currentUserId: string | null) => {
  const [incomingCall, setIncomingCall] = useState<CallRequest | null>(null);
  const [activeCall, setActiveCall] = useState<{
    remoteUserId: string;
    remoteUserName: string;
    remoteUserAvatar?: string | null;
    isIncoming: boolean;
    isVoiceOnly: boolean;
  } | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Play ringtone when there's an incoming call
  useRingtone(!!incomingCall);

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel(`incoming-calls-${currentUserId}`)
      .on("broadcast", { event: "call-request" }, async ({ payload }) => {
        if (payload.to === currentUserId && !activeCall) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", payload.from)
            .single();

          setIncomingCall({
            from: payload.from,
            fromName: profile?.full_name || "Unknown",
            fromAvatar: profile?.avatar_url,
            isVoiceOnly: payload.isVoiceOnly || false,
          });
        }
      })
      .on("broadcast", { event: "call-rejected" }, ({ payload }) => {
        if (payload.to === currentUserId) {
          setActiveCall(null);
        }
      })
      .on("broadcast", { event: "call-ended" }, ({ payload }) => {
        if (payload.to === currentUserId) {
          setActiveCall(null);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [currentUserId, activeCall]);

  const sendBroadcast = useCallback(async (targetUserId: string, event: string, extra: Record<string, any> = {}) => {
    if (!currentUserId) return;
    const channel = supabase.channel(`incoming-calls-${targetUserId}`);
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.send({
          type: "broadcast",
          event,
          payload: { from: currentUserId, to: targetUserId, ...extra },
        });
        setTimeout(() => supabase.removeChannel(channel), 1000);
      }
    });
  }, [currentUserId]);

  const initiateCall = useCallback(
    async (
      remoteUserId: string,
      remoteUserName: string,
      remoteUserAvatar?: string | null,
      isVoiceOnly: boolean = false
    ) => {
      if (!currentUserId) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", currentUserId)
        .single();

      await sendBroadcast(remoteUserId, "call-request", {
        fromName: profile?.full_name || "Unknown",
        fromAvatar: profile?.avatar_url,
        isVoiceOnly,
      });

      setActiveCall({
        remoteUserId,
        remoteUserName,
        remoteUserAvatar,
        isIncoming: false,
        isVoiceOnly,
      });
    },
    [currentUserId, sendBroadcast]
  );

  const acceptIncomingCall = useCallback(() => {
    if (!incomingCall) return;

    setActiveCall({
      remoteUserId: incomingCall.from,
      remoteUserName: incomingCall.fromName,
      remoteUserAvatar: incomingCall.fromAvatar,
      isIncoming: true,
      isVoiceOnly: incomingCall.isVoiceOnly || false,
    });
    setIncomingCall(null);
  }, [incomingCall]);

  const rejectIncomingCall = useCallback(() => {
    if (incomingCall) {
      sendBroadcast(incomingCall.from, "call-rejected");
    }
    setIncomingCall(null);
  }, [incomingCall, sendBroadcast]);

  const endCall = useCallback(() => {
    if (activeCall) {
      sendBroadcast(activeCall.remoteUserId, "call-ended");
    }
    setActiveCall(null);
    setIncomingCall(null);
  }, [activeCall, sendBroadcast]);

  return {
    incomingCall,
    activeCall,
    initiateCall,
    acceptIncomingCall,
    rejectIncomingCall,
    endCall,
  };
};
