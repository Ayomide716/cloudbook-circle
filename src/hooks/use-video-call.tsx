import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CallRequest {
  from: string;
  fromName: string;
  fromAvatar?: string | null;
}

export const useVideoCall = (currentUserId: string | null) => {
  const [incomingCall, setIncomingCall] = useState<CallRequest | null>(null);
  const [activeCall, setActiveCall] = useState<{
    remoteUserId: string;
    remoteUserName: string;
    remoteUserAvatar?: string | null;
    isIncoming: boolean;
  } | null>(null);

  useEffect(() => {
    if (!currentUserId) return;

    // Listen for incoming calls across all potential callers
    const channel = supabase
      .channel(`incoming-calls-${currentUserId}`)
      .on("broadcast", { event: "call-request" }, async ({ payload }) => {
        if (payload.to === currentUserId && !activeCall) {
          // Get caller's profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", payload.from)
            .single();

          setIncomingCall({
            from: payload.from,
            fromName: profile?.full_name || "Unknown",
            fromAvatar: profile?.avatar_url,
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, activeCall]);

  const initiateCall = useCallback(
    async (remoteUserId: string, remoteUserName: string, remoteUserAvatar?: string | null) => {
      if (!currentUserId) return;

      // Get current user's profile for the notification
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", currentUserId)
        .single();

      // Send call request to the remote user's channel
      const channel = supabase.channel(`incoming-calls-${remoteUserId}`);
      await channel.subscribe();
      
      channel.send({
        type: "broadcast",
        event: "call-request",
        payload: {
          from: currentUserId,
          fromName: profile?.full_name || "Unknown",
          fromAvatar: profile?.avatar_url,
          to: remoteUserId,
        },
      });

      setActiveCall({
        remoteUserId,
        remoteUserName,
        remoteUserAvatar,
        isIncoming: false,
      });
    },
    [currentUserId]
  );

  const acceptIncomingCall = useCallback(() => {
    if (!incomingCall) return;

    setActiveCall({
      remoteUserId: incomingCall.from,
      remoteUserName: incomingCall.fromName,
      remoteUserAvatar: incomingCall.fromAvatar,
      isIncoming: true,
    });
    setIncomingCall(null);
  }, [incomingCall]);

  const rejectIncomingCall = useCallback(() => {
    setIncomingCall(null);
  }, []);

  const endCall = useCallback(() => {
    setActiveCall(null);
    setIncomingCall(null);
  }, []);

  return {
    incomingCall,
    activeCall,
    initiateCall,
    acceptIncomingCall,
    rejectIncomingCall,
    endCall,
  };
};
