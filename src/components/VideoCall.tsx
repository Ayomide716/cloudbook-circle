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
  onAccept?: () => void;
  onReject?: () => void;
  isVoiceOnly?: boolean;
  callAccepted?: boolean;
}

interface SignalMessage {
  type: "offer" | "answer" | "ice-candidate" | "screen-share-start" | "screen-share-stop";
  payload: any;
  from: string;
  to: string;
}

const VideoCall = ({
  currentUserId, remoteUserId, remoteUserName, remoteUserAvatar,
  onEnd, isIncoming = false, onAccept, onReject, isVoiceOnly = false, callAccepted = false,
}: VideoCallProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(!isVoiceOnly);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [isPiP, setIsPiP] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callStatus, setCallStatus] = useState<"calling" | "ringing" | "connected" | "ended">(
    isIncoming ? "ringing" : "calling"
  );
  const [signalQuality, setSignalQuality] = useState<"good" | "fair" | "poor">("good");

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const channelReadyRef = useRef<boolean>(false);
  const pendingIceCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const roomId = [currentUserId, remoteUserId].sort().join("-");

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

  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        { urls: "stun:stun3.l.google.com:19302" },
        { urls: "stun:stun4.l.google.com:19302" },
        { urls: "stun:stun.stunprotocol.org:3478" },
        { urls: "stun:stun.voip.blackberry.com:3478" },
      ],
      iceCandidatePoolSize: 10,
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({ type: "ice-candidate", payload: event.candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "failed") pc.restartIce();
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        remoteVideoRef.current.play().catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setIsConnected(true);
        setCallStatus("connected");
        callTimerRef.current = setInterval(() => setCallDuration((p) => p + 1), 1000);
        monitorStats();
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        handleEndCall();
      }
    };

    return pc;
  }, [sendSignal, monitorStats]);

  const startLocalStream = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: !isVoiceOnly ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    localStreamRef.current = stream;
    if (localVideoRef.current && !isVoiceOnly) localVideoRef.current.srcObject = stream;
    return stream;
  }, [isVoiceOnly]);

  const initiateCallFn = useCallback(async () => {
    try {
      const stream = await startLocalStream();
      const pc = createPeerConnection();
      peerConnectionRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
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
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      onAccept?.();
    } catch (error) {
      console.error("Error accepting call:", error);
      handleEndCall();
    }
  }, [startLocalStream, createPeerConnection, onAccept]);

  const createAndSendOffer = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (pc && channelReadyRef.current) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({ type: "offer", payload: offer });
    }
  }, [sendSignal]);

  const handleSignal = useCallback(
    async (message: SignalMessage) => {
      if (message.from !== remoteUserId || message.to !== currentUserId) return;
      const pc = peerConnectionRef.current;

      switch (message.type) {
        case "offer":
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
            for (const c of pendingIceCandidatesRef.current) {
              try { await pc.addIceCandidate(c); } catch {}
            }
            pendingIceCandidatesRef.current = [];
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal({ type: "answer", payload: answer });
          }
          break;
        case "answer":
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(message.payload));
            for (const c of pendingIceCandidatesRef.current) {
              try { await pc.addIceCandidate(c); } catch {}
            }
            pendingIceCandidatesRef.current = [];
          }
          break;
        case "ice-candidate":
          if (pc) {
            const candidate = new RTCIceCandidate(message.payload);
            if (pc.remoteDescription) {
              try { await pc.addIceCandidate(candidate); } catch {}
            } else {
              pendingIceCandidatesRef.current.push(candidate);
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
      const track = localStreamRef.current.getVideoTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsVideoEnabled(track.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsAudioEnabled(track.enabled);
      }
    }
  };

  const toggleSpeaker = () => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !remoteVideoRef.current.muted;
      setIsSpeakerMuted(!isSpeakerMuted);
    }
  };

  const toggleScreenShare = async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;

    if (isScreenSharing) {
      // Stop screen share, revert to camera
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
      sendSignal({ type: "screen-share-stop", payload: {} });
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
        sendSignal({ type: "screen-share-start", payload: {} });
      } catch {
        // User cancelled
      }
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

  // Trigger offer on callAccepted
  useEffect(() => {
    if (callAccepted && !isIncoming && channelReadyRef.current && peerConnectionRef.current) {
      createAndSendOffer();
    }
  }, [callAccepted, isIncoming, createAndSendOffer]);

  useEffect(() => {
    const channel = supabase
      .channel(`video-call-${roomId}`)
      .on("broadcast", { event: "signal" }, ({ payload }) => handleSignal(payload as SignalMessage))
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          channelReadyRef.current = true;
          if (!isIncoming) setTimeout(() => initiateCallFn(), 1000);
        }
      });

    signalingChannelRef.current = channel;
    return () => { cleanup(); };
  }, [roomId, isIncoming, initiateCallFn, handleSignal, cleanup]);

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
        {isConnected && !isVoiceOnly ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-background">
            <div className="text-center">
              <Avatar className={cn(
                "mx-auto mb-4 ring-4",
                callStatus === "calling" ? "ring-primary/30 animate-pulse h-28 w-28" : "ring-primary/20 h-24 w-24"
              )}>
                <AvatarImage src={remoteUserAvatar || undefined} />
                <AvatarFallback className="text-3xl bg-primary/20">{remoteUserName?.[0]?.toUpperCase() || "U"}</AvatarFallback>
              </Avatar>
              <p className={cn("font-semibold text-lg", isFullscreen && "text-white")}>{remoteUserName}</p>
              <p className={cn("text-sm mt-1", isFullscreen ? "text-white/60" : "text-muted-foreground")}>
                {callStatus === "calling" && (
                  <span className="flex items-center justify-center gap-2">
                    <span className="flex gap-1">
                      {[0, 150, 300].map((d) => (
                        <span key={d} className="h-2 w-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </span>
                    Calling...
                  </span>
                )}
                {callStatus === "ringing" && "Incoming call..."}
                {callStatus === "connected" && isVoiceOnly && formatDuration(callDuration)}
              </p>
            </div>
          </div>
        )}

        {/* Local Video PIP */}
        {isConnected && !isVoiceOnly && (
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
        {callStatus === "ringing" ? (
          <>
            <Button variant="destructive" size="icon" className="h-14 w-14 rounded-full shadow-lg" onClick={handleReject}>
              <PhoneOff className="h-6 w-6" />
            </Button>
            <Button className="h-14 w-14 rounded-full bg-green-500 hover:bg-green-600 shadow-lg" size="icon" onClick={acceptCall}>
              <Phone className="h-6 w-6" />
            </Button>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
};

export default VideoCall;
