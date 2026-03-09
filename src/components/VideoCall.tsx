import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Video, VideoOff, Mic, MicOff, Phone, PhoneOff,
  Maximize2, Minimize2, Monitor, MonitorOff,
  SwitchCamera, Volume2, VolumeX, PictureInPicture2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getIceServers } from "@/lib/webrtc";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface VideoCallProps {
  currentUserId: string;
  remoteUserId: string;
  remoteUserName: string;
  remoteUserAvatar?: string | null;
  onEnd: () => void;
  isIncoming?: boolean;
  isVoiceOnly?: boolean;
}

interface SignalMessage {
  type: "offer" | "answer" | "ice-candidate" | "ready" | "screen-share-start" | "screen-share-stop";
  payload: any;
  from: string;
  to: string;
}


const VideoCall = ({
  currentUserId, remoteUserId, remoteUserName, remoteUserAvatar,
  onEnd, isIncoming = false, isVoiceOnly = false,
}: VideoCallProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(!isVoiceOnly);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [isPiP, setIsPiP] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callStatus, setCallStatus] = useState<"connecting" | "connected" | "ended">("connecting");
  const [signalQuality, setSignalQuality] = useState<"good" | "fair" | "poor">("good");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const channelReadyRef = useRef(false);
  const pendingIceCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const pendingSignalsRef = useRef<SignalMessage[]>([]);
  const hasCreatedOfferRef = useRef(false);
  const remoteReadyRef = useRef(false);
  const setupCompleteRef = useRef(false);
  const hasEndedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const roomId = [currentUserId, remoteUserId].sort().join("-");
  const handleSignalRef = useRef<(msg: SignalMessage) => Promise<void>>();
  const setupCallRef = useRef<() => Promise<void>>();

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`
      : `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const cleanup = useCallback(() => {
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop());
    if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach((t) => t.stop());
    if (peerConnectionRef.current) peerConnectionRef.current.close();
    if (signalingChannelRef.current) supabase.removeChannel(signalingChannelRef.current);
    channelReadyRef.current = false;
    peerConnectionRef.current = null;
    localStreamRef.current = null;
    screenStreamRef.current = null;
    signalingChannelRef.current = null;
    pendingIceCandidatesRef.current = [];
    pendingSignalsRef.current = [];
    remoteReadyRef.current = false;
    setupCompleteRef.current = false;
    hasCreatedOfferRef.current = false;
    setRemoteStream(null);
  }, []);

  const sendSignal = useCallback(
    (message: Omit<SignalMessage, "from" | "to">) => {
      if (!channelReadyRef.current || !signalingChannelRef.current) return;
      signalingChannelRef.current.send({
        type: "broadcast",
        event: "signal",
        payload: { ...message, from: currentUserId, to: remoteUserId },
      });
    },
    [currentUserId, remoteUserId]
  );

  const attachRemoteStream = useCallback((stream: MediaStream) => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
      remoteVideoRef.current.play().catch(() => {});
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream;
      remoteAudioRef.current.muted = isSpeakerMuted;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [isSpeakerMuted]);

  useEffect(() => {
    if (remoteStream) attachRemoteStream(remoteStream);
  }, [remoteStream, attachRemoteStream]);

  const monitorStats = useCallback(() => {
    statsIntervalRef.current = setInterval(async () => {
      const pc = peerConnectionRef.current;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        stats.forEach((report) => {
          if (report.type === "candidate-pair" && report.state === "succeeded") {
            const rtt = report.currentRoundTripTime;
            if (rtt !== undefined) {
              setSignalQuality(rtt < 0.1 ? "good" : rtt < 0.3 ? "fair" : "poor");
            }
          }
        });
      } catch {}
    }, 3000);
  }, []);

  const handleEndCall = useCallback(() => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;
    setCallStatus("ended");
    cleanup();
    onEnd();
  }, [cleanup, onEnd]);

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
      iceCandidatePoolSize: 10,
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({ type: "ice-candidate", payload: event.candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[WebRTC] ICE state:", pc.iceConnectionState);
      if (pc.iceConnectionState === "failed") pc.restartIce();
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      console.log("[WebRTC] Got remote track:", event.track.kind);
      setRemoteStream(stream);
      attachRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      console.log("[WebRTC] Connection state:", pc.connectionState);
      if (pc.connectionState === "connected") {
        setIsConnected(true);
        setCallStatus("connected");
        if (!callTimerRef.current) {
          callTimerRef.current = setInterval(() => setCallDuration((p) => p + 1), 1000);
        }
        if (!statsIntervalRef.current) monitorStats();
      } else if (pc.connectionState === "disconnected") {
        setIsConnected(false);
        setCallStatus("connecting");
      } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        handleEndCall();
      }
    };

    return pc;
  }, [sendSignal, monitorStats, handleEndCall, attachRemoteStream]);

  const startLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: !isVoiceOnly ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      if (localVideoRef.current && !isVoiceOnly) localVideoRef.current.srcObject = stream;
      return stream;
    } catch (error) {
      console.error("[WebRTC] Failed to get media:", error);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      return stream;
    }
  }, [isVoiceOnly]);

  const createAndSendOffer = useCallback(async (pc?: RTCPeerConnection) => {
    const peerConn = pc || peerConnectionRef.current;
    if (!peerConn || !channelReadyRef.current || hasCreatedOfferRef.current) return;

    try {
      console.log("[WebRTC] Creating and sending offer");
      const offer = await peerConn.createOffer();
      await peerConn.setLocalDescription(offer);
      sendSignal({ type: "offer", payload: offer });
      hasCreatedOfferRef.current = true;
    } catch (error) {
      console.error("[WebRTC] Error creating offer:", error);
    }
  }, [sendSignal]);

  const processSignal = useCallback(async (pc: RTCPeerConnection, message: SignalMessage) => {
    switch (message.type) {
      case "offer": {
        console.log("[WebRTC] Received offer, creating answer");
        await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
        for (const c of pendingIceCandidatesRef.current) {
          try { await pc.addIceCandidate(c); } catch {}
        }
        pendingIceCandidatesRef.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: "answer", payload: answer });
        break;
      }
      case "answer": {
        console.log("[WebRTC] Received answer");
        await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
        for (const c of pendingIceCandidatesRef.current) {
          try { await pc.addIceCandidate(c); } catch {}
        }
        pendingIceCandidatesRef.current = [];
        break;
      }
      case "ice-candidate": {
        const candidate = new RTCIceCandidate(message.payload);
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(candidate); } catch {}
        } else {
          pendingIceCandidatesRef.current.push(candidate);
        }
        break;
      }
    }
  }, [sendSignal]);

  const setupCall = useCallback(async () => {
    try {
      console.log("[WebRTC] Setting up call, isIncoming:", isIncoming);
      const stream = await startLocalStream();
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      setupCompleteRef.current = true;

      sendSignal({ type: "ready", payload: {} });

      const queuedMessages = [...pendingSignalsRef.current];
      pendingSignalsRef.current = [];
      for (const queuedMessage of queuedMessages) {
        await processSignal(pc, queuedMessage);
      }

      if (!isIncoming && remoteReadyRef.current) {
        await createAndSendOffer(pc);
      }
    } catch (error) {
      console.error("[WebRTC] Error setting up call:", error);
      handleEndCall();
    }
  }, [startLocalStream, createPeerConnection, isIncoming, sendSignal, processSignal, createAndSendOffer, handleEndCall]);

  const handleSignal = useCallback(
    async (message: SignalMessage) => {
      if (message.from !== remoteUserId || message.to !== currentUserId) return;

      if (message.type === "ready") {
        remoteReadyRef.current = true;
        if (!isIncoming && setupCompleteRef.current && peerConnectionRef.current) {
          await createAndSendOffer(peerConnectionRef.current);
        }
        return;
      }

      if (!setupCompleteRef.current || !peerConnectionRef.current) {
        pendingSignalsRef.current.push(message);
        return;
      }

      await processSignal(peerConnectionRef.current, message);
    },
    [remoteUserId, currentUserId, isIncoming, createAndSendOffer, processSignal]
  );

  // Keep refs up to date so the channel callback always uses the latest version
  handleSignalRef.current = handleSignal;
  setupCallRef.current = setupCall;

  const toggleVideo = () => {
    if (localStreamRef.current && !isVoiceOnly) {
      const track = localStreamRef.current.getVideoTracks()[0];
      if (track) { track.enabled = !track.enabled; setIsVideoEnabled(track.enabled); }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) { track.enabled = !track.enabled; setIsAudioEnabled(track.enabled); }
    }
  };

  const toggleSpeaker = () => {
    const nextMuted = !isSpeakerMuted;
    if (remoteAudioRef.current) remoteAudioRef.current.muted = nextMuted;
    if (remoteVideoRef.current) remoteVideoRef.current.muted = nextMuted;
    setIsSpeakerMuted(nextMuted);
  };

  const toggleScreenShare = async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    if (isScreenSharing) {
      if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      const camStream = localStreamRef.current;
      if (camStream) {
        const videoTrack = camStream.getVideoTracks()[0];
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender && videoTrack) await sender.replaceTrack(videoTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = camStream;
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" } as any, audio: true });
        screenStreamRef.current = screen;
        const videoTrack = screen.getVideoTracks()[0];
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(videoTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = screen;
        videoTrack.onended = () => toggleScreenShare();
        setIsScreenSharing(true);
      } catch {}
    }
  };

  const switchCamera = async () => {
    if (!localStreamRef.current || isVoiceOnly) return;
    const track = localStreamRef.current.getVideoTracks()[0];
    if (!track) return;
    const constraints = track.getConstraints();
    const facingMode = (constraints.facingMode as string) === "user" ? "environment" : "user";
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const newTrack = newStream.getVideoTracks()[0];
      const pc = peerConnectionRef.current;
      if (pc) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(newTrack);
      }
      track.stop();
      localStreamRef.current.removeTrack(track);
      localStreamRef.current.addTrack(newTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    } catch {}
  };

  const togglePiP = async () => {
    if (!remoteVideoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
      } else {
        await remoteVideoRef.current.requestPictureInPicture();
        setIsPiP(true);
      }
    } catch {}
  };

  // Subscribe to signaling channel and set up call
  useEffect(() => {
    console.log("[WebRTC] Mounting VideoCall, roomId:", roomId, "isIncoming:", isIncoming);

    const channel = supabase
      .channel(`video-call-${roomId}`)
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        // Use ref to always call the latest handleSignal
        handleSignalRef.current?.(payload as SignalMessage);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          console.log("[WebRTC] Signaling channel subscribed");
          channelReadyRef.current = true;
          // Small delay to ensure both sides are subscribed
          setTimeout(() => setupCallRef.current?.(), 500);
        }
      });

    signalingChannelRef.current = channel;
    return () => { cleanup(); };
  }, []); // Mount once only

  const qualityColor = signalQuality === "good" ? "bg-green-500" : signalQuality === "fair" ? "bg-yellow-500" : "bg-red-500";

  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed z-50 flex flex-col transition-all duration-300",
        isFullscreen
          ? "inset-0 bg-black"
          : "bottom-4 right-4 w-[340px] h-[460px] rounded-2xl shadow-2xl border border-border overflow-hidden bg-background/95 backdrop-blur-xl"
      )}
    >
      {/* Header */}
      <div className={cn(
        "p-3 flex items-center justify-between z-10",
        isFullscreen ? "absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent text-white" : "border-b"
      )}>
        <div className="flex items-center gap-2">
          <div className={cn("h-2.5 w-2.5 rounded-full", isConnected ? qualityColor : "bg-yellow-500 animate-pulse")} />
          <span className="text-sm font-medium">
            {isVoiceOnly ? "Voice Call" : isScreenSharing ? "Screen Sharing" : "Video Call"}
          </span>
          {isConnected && (
            <span className="text-sm opacity-75 font-mono ml-2">{formatDuration(callDuration)}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isConnected && !isVoiceOnly && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={cn("h-8 w-8", isFullscreen && "text-white hover:bg-white/20")} onClick={togglePiP}>
                  <PictureInPicture2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Picture-in-Picture</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className={cn("h-8 w-8", isFullscreen && "text-white hover:bg-white/20")} onClick={() => setIsFullscreen(!isFullscreen)}>
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isFullscreen ? "Minimize" : "Fullscreen"}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Remote Video / Avatar */}
      <div className="flex-1 relative bg-black overflow-hidden">
        {remoteStream && !isVoiceOnly ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-background">
            <div className="text-center">
              <Avatar className={cn(
                "mx-auto mb-4 ring-4 h-28 w-28",
                !isConnected ? "ring-primary/30 animate-pulse" : "ring-primary/20"
              )}>
                <AvatarImage src={remoteUserAvatar || undefined} />
                <AvatarFallback className="text-3xl bg-primary/20">{remoteUserName?.[0]?.toUpperCase() || "U"}</AvatarFallback>
              </Avatar>
              <p className={cn("font-semibold text-lg", isFullscreen && "text-white")}>{remoteUserName}</p>
              <p className={cn("text-sm mt-1", isFullscreen ? "text-white/60" : "text-muted-foreground")}>
                {callStatus === "connecting" && (
                  <span className="flex items-center justify-center gap-2">
                    <span className="flex gap-1">
                      {[0, 150, 300].map((d) => (
                        <span key={d} className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </span>
                    Connecting...
                  </span>
                )}
                {callStatus === "connected" && isVoiceOnly && formatDuration(callDuration)}
              </p>
            </div>
          </div>
        )}

        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

        {/* Local Video PIP */}
        {!isVoiceOnly && (
          <div className={cn(
            "absolute rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 transition-all duration-300",
            isFullscreen ? "bottom-24 right-6 w-40 h-56" : "bottom-4 right-4 w-24 h-32"
          )}>
            <video
              ref={localVideoRef}
              autoPlay playsInline muted
              className={cn("w-full h-full object-cover", !isVideoEnabled && "hidden")}
            />
            {!isVideoEnabled && (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <VideoOff className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
          </div>
        )}

        {/* Audio waveform for voice calls */}
        {isConnected && isVoiceOnly && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 flex items-end gap-1.5 h-12">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className="w-1.5 bg-primary rounded-full"
                style={{
                  height: `${Math.random() * 32 + 12}px`,
                  animation: `pulse 0.5s ease-in-out infinite alternate`,
                  animationDelay: `${i * 80}ms`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className={cn(
        "flex items-center justify-center gap-2 py-4 px-6",
        isFullscreen
          ? "absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pb-8"
          : "bg-card/80 backdrop-blur"
      )}>
        {/* Mic */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isAudioEnabled ? "secondary" : "destructive"}
              size="icon"
              className={cn("h-12 w-12 rounded-full shadow-md", isFullscreen && isAudioEnabled && "bg-white/20 hover:bg-white/30 text-white")}
              onClick={toggleAudio}
            >
              {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isAudioEnabled ? "Mute" : "Unmute"}</TooltipContent>
        </Tooltip>

        {/* Speaker */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isSpeakerMuted ? "destructive" : "secondary"}
              size="icon"
              className={cn("h-12 w-12 rounded-full shadow-md", isFullscreen && !isSpeakerMuted && "bg-white/20 hover:bg-white/30 text-white")}
              onClick={toggleSpeaker}
            >
              {isSpeakerMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isSpeakerMuted ? "Unmute Speaker" : "Mute Speaker"}</TooltipContent>
        </Tooltip>

        {/* End call */}
        <Button variant="destructive" size="icon" className="h-14 w-14 rounded-full shadow-lg" onClick={handleEndCall}>
          <PhoneOff className="h-6 w-6" />
        </Button>

        {/* Camera toggle */}
        {!isVoiceOnly && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isVideoEnabled ? "secondary" : "destructive"}
                size="icon"
                className={cn("h-12 w-12 rounded-full shadow-md", isFullscreen && isVideoEnabled && "bg-white/20 hover:bg-white/30 text-white")}
                onClick={toggleVideo}
              >
                {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isVideoEnabled ? "Camera Off" : "Camera On"}</TooltipContent>
          </Tooltip>
        )}

        {/* Screen share */}
        {!isVoiceOnly && isConnected && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isScreenSharing ? "default" : "secondary"}
                size="icon"
                className={cn("h-12 w-12 rounded-full shadow-md", isFullscreen && !isScreenSharing && "bg-white/20 hover:bg-white/30 text-white")}
                onClick={toggleScreenShare}
              >
                {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isScreenSharing ? "Stop Sharing" : "Share Screen"}</TooltipContent>
          </Tooltip>
        )}

        {/* Switch camera (mobile) */}
        {!isVoiceOnly && isConnected && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className={cn("h-12 w-12 rounded-full shadow-md md:hidden", isFullscreen && "bg-white/20 hover:bg-white/30 text-white")}
                onClick={switchCamera}
              >
                <SwitchCamera className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Switch Camera</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default VideoCall;
