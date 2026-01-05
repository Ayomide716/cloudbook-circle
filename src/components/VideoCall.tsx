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
}

interface SignalMessage {
  type: "offer" | "answer" | "ice-candidate" | "call-request" | "call-accepted" | "call-rejected" | "call-ended";
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
}: VideoCallProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [callStatus, setCallStatus] = useState<"calling" | "ringing" | "connected" | "ended">(
    isIncoming ? "ringing" : "calling"
  );

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const roomId = [currentUserId, remoteUserId].sort().join("-");

  const cleanup = useCallback(() => {
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
  }, []);

  const sendSignal = useCallback(
    (message: Omit<SignalMessage, "from" | "to">) => {
      signalingChannelRef.current?.send({
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
      if (pc.connectionState === "connected") {
        setIsConnected(true);
        setCallStatus("connected");
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        handleEndCall();
      }
    };

    return pc;
  }, [sendSignal]);

  const startLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      throw error;
    }
  }, []);

  const initiateCall = useCallback(async () => {
    try {
      const stream = await startLocalStream();
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // Send call request first
      sendSignal({ type: "call-request", payload: {} });
    } catch (error) {
      console.error("Error initiating call:", error);
      handleEndCall();
    }
  }, [startLocalStream, createPeerConnection, sendSignal]);

  const acceptCall = useCallback(async () => {
    try {
      setCallStatus("connected");
      const stream = await startLocalStream();
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      sendSignal({ type: "call-accepted", payload: {} });
      onAccept?.();
    } catch (error) {
      console.error("Error accepting call:", error);
      handleEndCall();
    }
  }, [startLocalStream, createPeerConnection, sendSignal, onAccept]);

  const handleSignal = useCallback(
    async (message: SignalMessage) => {
      if (message.from !== remoteUserId || message.to !== currentUserId) return;

      const pc = peerConnectionRef.current;

      switch (message.type) {
        case "call-accepted":
          if (pc) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal({ type: "offer", payload: offer });
          }
          break;

        case "call-rejected":
          setCallStatus("ended");
          cleanup();
          onEnd();
          break;

        case "call-ended":
          setCallStatus("ended");
          cleanup();
          onEnd();
          break;

        case "offer":
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal({ type: "answer", payload: answer });
          }
          break;

        case "answer":
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
          }
          break;

        case "ice-candidate":
          if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(message.payload));
          }
          break;
      }
    },
    [remoteUserId, currentUserId, sendSignal, cleanup, onEnd]
  );

  const handleEndCall = useCallback(() => {
    sendSignal({ type: "call-ended", payload: {} });
    setCallStatus("ended");
    cleanup();
    onEnd();
  }, [sendSignal, cleanup, onEnd]);

  const handleReject = useCallback(() => {
    sendSignal({ type: "call-rejected", payload: {} });
    setCallStatus("ended");
    cleanup();
    onReject?.();
    onEnd();
  }, [sendSignal, cleanup, onReject, onEnd]);

  const toggleVideo = () => {
    if (localStreamRef.current) {
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

  useEffect(() => {
    // Set up signaling channel
    signalingChannelRef.current = supabase
      .channel(`video-call-${roomId}`)
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        handleSignal(payload as SignalMessage);
      })
      .subscribe();

    // If not incoming, initiate the call
    if (!isIncoming) {
      initiateCall();
    }

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
          : "bottom-4 right-4 w-80 h-96 rounded-2xl shadow-2xl border border-border overflow-hidden"
      )}
    >
      {/* Remote Video / Avatar */}
      <div className="flex-1 relative bg-muted">
        {isConnected ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <Avatar className="h-24 w-24 mx-auto mb-4">
                <AvatarImage src={remoteUserAvatar || undefined} />
                <AvatarFallback className="text-3xl bg-primary/20">
                  {remoteUserName?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <p className="font-semibold text-lg">{remoteUserName}</p>
              <p className="text-sm text-muted-foreground animate-pulse">
                {callStatus === "calling" && "Calling..."}
                {callStatus === "ringing" && "Incoming call..."}
              </p>
            </div>
          </div>
        )}

        {/* Local Video PIP */}
        {(isConnected || callStatus === "connected") && (
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

        {/* Fullscreen Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 bg-background/50 hover:bg-background/70"
          onClick={() => setIsFullscreen(!isFullscreen)}
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Controls */}
      <div className="p-4 flex items-center justify-center gap-3 bg-card">
        {callStatus === "ringing" ? (
          <>
            <Button
              variant="destructive"
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={handleReject}
            >
              <PhoneOff className="h-5 w-5" />
            </Button>
            <Button
              className="h-12 w-12 rounded-full bg-green-500 hover:bg-green-600"
              size="icon"
              onClick={acceptCall}
            >
              <Phone className="h-5 w-5" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant={isAudioEnabled ? "secondary" : "destructive"}
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={toggleAudio}
            >
              {isAudioEnabled ? (
                <Mic className="h-4 w-4" />
              ) : (
                <MicOff className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="destructive"
              size="icon"
              className="h-12 w-12 rounded-full"
              onClick={handleEndCall}
            >
              <PhoneOff className="h-5 w-5" />
            </Button>
            <Button
              variant={isVideoEnabled ? "secondary" : "destructive"}
              size="icon"
              className="h-10 w-10 rounded-full"
              onClick={toggleVideo}
            >
              {isVideoEnabled ? (
                <Video className="h-4 w-4" />
              ) : (
                <VideoOff className="h-4 w-4" />
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default VideoCall;
