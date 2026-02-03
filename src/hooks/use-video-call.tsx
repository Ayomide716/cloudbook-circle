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
  const [callAccepted, setCallAccepted] = useState(false);
  
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  // Play ringtone when there's an incoming call
  useRingtone(!!incomingCall);

  useEffect(() => {
    if (!currentUserId) return;

    // Listen for incoming calls AND call responses
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
      .on("broadcast", { event: "call-accepted" }, ({ payload }) => {
        // Caller receives this when recipient accepts
        if (payload.to === currentUserId && activeCall?.remoteUserId === payload.from) {
          console.log("Call accepted by recipient via incoming-calls channel");
          setCallAccepted(true);
        }
      })
      .on("broadcast", { event: "call-rejected" }, ({ payload }) => {
        // Caller receives this when recipient rejects
        if (payload.to === currentUserId) {
          console.log("Call rejected by recipient");
          setActiveCall(null);
          setCallAccepted(false);
        }
      })
      .on("broadcast", { event: "call-ended" }, ({ payload }) => {
        // Either party receives this when call ends
        if (payload.to === currentUserId) {
          console.log("Call ended by other party");
          setActiveCall(null);
          setCallAccepted(false);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("Incoming calls channel subscribed for", currentUserId);
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

      setCallAccepted(false);
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

  // Send call accepted notification to caller via their incoming-calls channel
  const sendCallAcceptedToCaller = useCallback(async (callerId: string) => {
    if (!currentUserId) return;
    
    const channel = supabase.channel(`incoming-calls-${callerId}`);
    
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.send({
          type: "broadcast",
          event: "call-accepted",
          payload: {
            from: currentUserId,
            to: callerId,
          },
        });
        console.log("Sent call-accepted to caller via incoming-calls channel");
        
        setTimeout(() => {
          supabase.removeChannel(channel);
        }, 1000);
      }
    });
  }, [currentUserId]);

  // Send call rejected notification to caller
  const sendCallRejectedToCaller = useCallback(async (callerId: string) => {
    if (!currentUserId) return;
    
    const channel = supabase.channel(`incoming-calls-${callerId}`);
    
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.send({
          type: "broadcast",
          event: "call-rejected",
          payload: {
            from: currentUserId,
            to: callerId,
          },
        });
        console.log("Sent call-rejected to caller");
        
        setTimeout(() => {
          supabase.removeChannel(channel);
        }, 1000);
      }
    });
  }, [currentUserId]);

  // Send call ended notification
  const sendCallEndedToRemote = useCallback(async (remoteUserId: string) => {
    if (!currentUserId) return;
    
    const channel = supabase.channel(`incoming-calls-${remoteUserId}`);
    
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.send({
          type: "broadcast",
          event: "call-ended",
          payload: {
            from: currentUserId,
            to: remoteUserId,
          },
        });
        console.log("Sent call-ended to remote");
        
        setTimeout(() => {
          supabase.removeChannel(channel);
        }, 1000);
      }
    });
  }, [currentUserId]);

  const acceptIncomingCall = useCallback(() => {
    if (!incomingCall) return;

    // Notify the caller that call was accepted
    sendCallAcceptedToCaller(incomingCall.from);

    setActiveCall({
      remoteUserId: incomingCall.from,
      remoteUserName: incomingCall.fromName,
      remoteUserAvatar: incomingCall.fromAvatar,
      isIncoming: true,
      isVoiceOnly: incomingCall.isVoiceOnly || false,
    });
    setIncomingCall(null);
  }, [incomingCall, sendCallAcceptedToCaller]);

  const rejectIncomingCall = useCallback(() => {
    if (incomingCall) {
      sendCallRejectedToCaller(incomingCall.from);
    }
    setIncomingCall(null);
  }, [incomingCall, sendCallRejectedToCaller]);

  const endCall = useCallback(() => {
    if (activeCall) {
      sendCallEndedToRemote(activeCall.remoteUserId);
    }
    setActiveCall(null);
    setIncomingCall(null);
    setCallAccepted(false);
  }, [activeCall, sendCallEndedToRemote]);

  return {
    incomingCall,
    activeCall,
    callAccepted,
    initiateCall,
    acceptIncomingCall,
    rejectIncomingCall,
    endCall,
  };
};
