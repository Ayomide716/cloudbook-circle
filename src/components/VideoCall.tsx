import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoCallProps {
  currentUserId: string;
  remoteUserId: string;
  remoteUserName: string;
  remoteUserAvatar?: string | null;
  onEnd: () => void;
  isIncoming?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  isVoiceOnly?: boolean;
  callAccepted?: boolean; // For caller: true when recipient accepts via incoming-calls channel
}

interface SignalMessage {
  type: "offer" | "answer" | "ice-candidate";
  payload: any;
  from: string;
  to: string;
}

const VideoCall = ({
  currentUserId,
  remoteUserId,
  remoteUserName,
  remoteUserAvatar,
  onEnd,
  isIncoming = false,
  onAccept,
  onReject,
  isVoiceOnly = false,
  callAccepted = false,
}: VideoCallProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(!isVoiceOnly);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callStatus, setCallStatus] = useState<"calling" | "ringing" | "connected" | "ended">(
    isIncoming ? "ringing" : "calling"
  );

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const channelReadyRef = useRef<boolean>(false);

  const roomId = [currentUserId, remoteUserId].sort().join("-");

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const cleanup = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (signalingChannelRef.current) {
      supabase.removeChannel(signalingChannelRef.current);
      signalingChannelRef.current = null;
    }
    channelReadyRef.current = false;
  }, []);

  const sendSignal = useCallback(
    (message: Omit<SignalMessage, "from" | "to">) => {
      if (!channelReadyRef.current || !signalingChannelRef.current) {
        console.log("Channel not ready, cannot send signal");
        return;
      }
      signalingChannelRef.current.send({
        type: "broadcast",
        event: "signal",
        payload: { ...message, from: currentUserId, to: remoteUserId },
      });
    },
    [currentUserId, remoteUserId]
  );

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({
          type: "ice-candidate",
          payload: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("Connection state:", pc.connectionState);
      if (pc.connectionState === "connected") {
        setIsConnected(true);
        setCallStatus("connected");
        // Start call timer
        callTimerRef.current = setInterval(() => {
          setCallDuration(prev => prev + 1);
        }, 1000);
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        handleEndCall();
      }
    };

    return pc;
  }, [sendSignal]);

  const startLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: !isVoiceOnly,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current && !isVoiceOnly) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      throw error;
    }
  }, [isVoiceOnly]);

  const initiateCall = useCallback(async () => {
    try {
      const stream = await startLocalStream();
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Call request is already sent by useVideoCall hook via incoming-calls channel
      // Just wait for the recipient to accept and send call-accepted signal
      console.log("Waiting for call to be accepted...");
    } catch (error) {
      console.error("Error initiating call:", error);
      handleEndCall();
    }
  }, [startLocalStream, createPeerConnection]);

  const acceptCall = useCallback(async () => {
    try {
      setCallStatus("connected");
      const stream = await startLocalStream();
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Call the parent's onAccept which sends call-accepted via incoming-calls channel
      onAccept?.();
    } catch (error) {
      console.error("Error accepting call:", error);
      handleEndCall();
    }
  }, [startLocalStream, createPeerConnection, onAccept]);

  // When caller receives callAccepted, create the offer
  const createAndSendOffer = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (pc && channelReadyRef.current) {
      try {
        console.log("Creating WebRTC offer...");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({ type: "offer", payload: offer });
        console.log("Offer sent");
      } catch (error) {
        console.error("Error creating offer:", error);
      }
    }
  }, [sendSignal]);

  const handleSignal = useCallback(
    async (message: SignalMessage) => {
      if (message.from !== remoteUserId || message.to !== currentUserId) return;

      const pc = peerConnectionRef.current;

      switch (message.type) {
        case "offer":
          if (pc) {
            try {
              console.log("Received offer, creating answer...");
              await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              sendSignal({ type: "answer", payload: answer });
              console.log("Answer sent");
            } catch (error) {
              console.error("Error handling offer:", error);
            }
          }
          break;

        case "answer":
          if (pc) {
            try {
              console.log("Received answer, setting remote description...");
              await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
            } catch (error) {
              console.error("Error setting remote description:", error);
            }
          }
          break;

        case "ice-candidate":
          if (pc && pc.remoteDescription) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(message.payload));
            } catch (error) {
              console.error("Error adding ICE candidate:", error);
            }
          }
          break;
      }
    },
    [remoteUserId, currentUserId, sendSignal]
  );

  const handleEndCall = useCallback(() => {
    setCallStatus("ended");
    cleanup();
    onEnd();
  }, [cleanup, onEnd]);

  const handleReject = useCallback(() => {
    setCallStatus("ended");
    cleanup();
    onReject?.();
    onEnd();
  }, [cleanup, onReject, onEnd]);

  const toggleVideo = () => {
    if (localStreamRef.current && !isVoiceOnly) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  // Effect to trigger offer creation when callAccepted becomes true (for caller)
  useEffect(() => {
    if (callAccepted && !isIncoming && channelReadyRef.current && peerConnectionRef.current) {
      console.log("Call accepted, creating offer...");
      createAndSendOffer();
    }
  }, [callAccepted, isIncoming, createAndSendOffer]);

  useEffect(() => {
    // Set up signaling channel
    const channel = supabase
      .channel(`video-call-${roomId}`)
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        handleSignal(payload as SignalMessage);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          console.log("Video call signaling channel connected");
          channelReadyRef.current = true;
          
          // If not incoming, initiate the call after channel is ready
          if (!isIncoming) {
            // Small delay to ensure both sides are connected
            setTimeout(() => {
              initiateCall();
            }, 1000);
          }
        }
      });

    signalingChannelRef.current = channel;

    return () => {
      cleanup();
    };
  }, [roomId, isIncoming, initiateCall, handleSignal, cleanup]);

  return (
    <div
      className={cn(
        "fixed z-50 bg-background/95 backdrop-blur-xl flex flex-col",
        isFullscreen
          ? "inset-0"
          : "bottom-4 right-4 w-80 h-[420px] rounded-2xl shadow-2xl border border-border overflow-hidden"
      )}
    >
      {/* Header */}
      <div className="p-3 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className={cn(
            "h-2 w-2 rounded-full",
            isConnected ? "bg-green-500" : "bg-yellow-500 animate-pulse"
          )} />
          <span className="text-sm font-medium">
            {isVoiceOnly ? "Voice Call" : "Video Call"}
          </span>
        </div>
        {isConnected && (
          <span className="text-sm text-muted-foreground font-mono">
            {formatDuration(callDuration)}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setIsFullscreen(!isFullscreen)}
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Remote Video / Avatar */}
      <div className="flex-1 relative bg-muted">
        {isConnected && !isVoiceOnly ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <Avatar className="h-24 w-24 mx-auto mb-4 ring-4 ring-primary/20">
                <AvatarImage src={remoteUserAvatar || undefined} />
                <AvatarFallback className="text-3xl bg-primary/20">
                  {remoteUserName?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <p className="font-semibold text-lg">{remoteUserName}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {callStatus === "calling" && (
                  <span className="flex items-center justify-center gap-2">
                    <span className="flex gap-1">
                      <span className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                    Calling
                  </span>
                )}
                {callStatus === "ringing" && "Incoming call"}
                {callStatus === "connected" && isVoiceOnly && formatDuration(callDuration)}
              </p>
            </div>
          </div>
        )}

        {/* Local Video PIP */}
        {isConnected && !isVoiceOnly && (
          <div className="absolute bottom-4 right-4 w-24 h-32 rounded-lg overflow-hidden shadow-lg border-2 border-background">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={cn(
                "w-full h-full object-cover",
                !isVideoEnabled && "hidden"
              )}
            />
            {!isVideoEnabled && (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <VideoOff className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </div>
        )}

        {/* Audio waveform animation for voice calls when connected */}
        {isConnected && isVoiceOnly && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-end gap-1 h-8">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-1 bg-primary rounded-full animate-pulse"
                style={{
                  height: `${Math.random() * 24 + 8}px`,
                  animationDelay: `${i * 100}ms`,
                  animationDuration: "500ms",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 flex items-center justify-center gap-3 bg-card/80 backdrop-blur">
        {callStatus === "ringing" ? (
          <>
            <Button
              variant="destructive"
              size="icon"
              className="h-14 w-14 rounded-full shadow-lg"
              onClick={handleReject}
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
            <Button
              className="h-14 w-14 rounded-full bg-green-500 hover:bg-green-600 shadow-lg"
              size="icon"
              onClick={acceptCall}
            >
              <Phone className="h-6 w-6" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant={isAudioEnabled ? "secondary" : "destructive"}
              size="icon"
              className="h-12 w-12 rounded-full shadow-md"
              onClick={toggleAudio}
            >
              {isAudioEnabled ? (
                <Mic className="h-5 w-5" />
              ) : (
                <MicOff className="h-5 w-5" />
              )}
            </Button>
            <Button
              variant="destructive"
              size="icon"
              className="h-14 w-14 rounded-full shadow-lg"
              onClick={handleEndCall}
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
            {!isVoiceOnly && (
              <Button
                variant={isVideoEnabled ? "secondary" : "destructive"}
                size="icon"
                className="h-12 w-12 rounded-full shadow-md"
                onClick={toggleVideo}
              >
                {isVideoEnabled ? (
                  <Video className="h-5 w-5" />
                ) : (
                  <VideoOff className="h-5 w-5" />
                )}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default VideoCall;
