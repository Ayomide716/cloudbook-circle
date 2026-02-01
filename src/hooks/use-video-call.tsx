import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

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
            isVoiceOnly: payload.isVoiceOnly || false,
          });
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("Incoming calls channel subscribed");
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [currentUserId, activeCall]);

  const initiateCall = useCallback(
    async (
      remoteUserId: string, 
      remoteUserName: string, 
      remoteUserAvatar?: string | null,
      isVoiceOnly: boolean = false
    ) => {
      if (!currentUserId) return;

      // Get current user's profile for the notification
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", currentUserId)
        .single();

      // Create a new channel for sending the call request
      const channel = supabase.channel(`incoming-calls-${remoteUserId}`);
      
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.send({
            type: "broadcast",
            event: "call-request",
            payload: {
              from: currentUserId,
              fromName: profile?.full_name || "Unknown",
              fromAvatar: profile?.avatar_url,
              to: remoteUserId,
              isVoiceOnly,
            },
          });
          console.log("Call request sent to", remoteUserId, isVoiceOnly ? "(voice only)" : "(video)");
          
          // Clean up the channel after sending
          setTimeout(() => {
            supabase.removeChannel(channel);
          }, 1000);
        }
      });

      setActiveCall({
        remoteUserId,
        remoteUserName,
        remoteUserAvatar,
        isIncoming: false,
        isVoiceOnly,
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
      isVoiceOnly: incomingCall.isVoiceOnly || false,
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
