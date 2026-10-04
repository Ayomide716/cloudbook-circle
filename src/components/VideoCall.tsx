import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Video, VideoOff, Mic, MicOff, PhoneOff,
  Maximize2, Minimize2, Monitor, MonitorOff,
  SwitchCamera, Volume2, VolumeX, PictureInPicture2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canShareScreen, formatCallDuration, getIceServers, loadIceServers } from "@/lib/webrtc";
import { useDraggable } from "@/hooks/use-draggable";
import { CallButton, StreamAudio, StreamVideo } from "@/components/calls/CallControls";

export type CallEndReason = "hangup" | "no-answer" | "failed" | "no-media";

interface VideoCallProps {
  currentUserId: string;
  remoteUserId: string;
  remoteUserName: string;
  remoteUserAvatar?: string | null;
  onEnd: (reason: CallEndReason) => void;
  isIncoming?: boolean;
  isVoiceOnly?: boolean;
}

type SignalBody =
  | { type: "offer" | "answer"; payload: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; payload: RTCIceCandidateInit }
  | { type: "ready"; payload: Record<string, never> }
  | { type: "media-state"; payload: MediaState };

interface MediaState {
  audio: boolean;
  video: boolean;
  screen: boolean;
}

type SignalMessage = SignalBody & { from: string; to: string };

// `cursor` is a valid display-capture constraint but missing from TypeScript's DOM types.
const SCREEN_SHARE_VIDEO: MediaTrackConstraints & { cursor?: "always" | "motion" | "never" } = { cursor: "always" };


const VideoCall = ({
  currentUserId, remoteUserId, remoteUserName, remoteUserAvatar,
  onEnd, isIncoming = false, isVoiceOnly = false,
}: VideoCallProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(!isVoiceOnly);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callStatus, setCallStatus] = useState<"connecting" | "connected" | "ended">("connecting");
  const [signalQuality, setSignalQuality] = useState<"good" | "fair" | "poor">("good");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  // What you see of yourself: the camera, or your screen while sharing.
  const [localPreview, setLocalPreview] = useState<MediaStream | null>(null);
  const [remoteReady, setRemoteReady] = useState(false);
  const [remoteMedia, setRemoteMedia] = useState<MediaState>({ audio: true, video: !isVoiceOnly, screen: false });
  const drag = useDraggable<HTMLDivElement>();

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

  const roomId = [currentUserId, remoteUserId].sort().join("-");
  const handleSignalRef = useRef<(msg: SignalMessage) => Promise<void>>();
  const setupCallRef = useRef<() => Promise<void>>();

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
    setLocalPreview(null);
  }, []);

  const sendSignal = useCallback(
    (message: SignalBody) => {
      if (!channelReadyRef.current || !signalingChannelRef.current) return;
      signalingChannelRef.current.send({
        type: "broadcast",
        event: "signal",
        payload: { ...message, from: currentUserId, to: remoteUserId },
      });
    },
    [currentUserId, remoteUserId]
  );

  // Tell the other side when the mic, camera or screen share changes, so they see it.
  const mediaStateRef = useRef<MediaState>({ audio: true, video: !isVoiceOnly, screen: false });
  const sendMediaState = useCallback((patch: Partial<MediaState> = {}) => {
    mediaStateRef.current = { ...mediaStateRef.current, ...patch };
    sendSignal({ type: "media-state", payload: mediaStateRef.current });
  }, [sendSignal]);

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
      } catch {
        // Stats are best-effort; the connection may already be closed.
      }
    }, 3000);
  }, []);

  const handleEndCall = useCallback((reason: CallEndReason = "hangup") => {
    if (hasEndedRef.current) return;
    hasEndedRef.current = true;
    setCallStatus("ended");
    cleanup();
    onEnd(reason);
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
        sendMediaState();
      } else if (pc.connectionState === "disconnected") {
        setIsConnected(false);
        setCallStatus("connecting");
      } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        handleEndCall("failed");
      }
    };

    return pc;
  }, [sendSignal, monitorStats, handleEndCall, sendMediaState]);

  const startLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: !isVoiceOnly ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      setLocalPreview(stream);
      return stream;
    } catch (error) {
      // No camera (or it's in use): carry on with sound only.
      console.error("[WebRTC] Failed to get media:", error);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      mediaStateRef.current.video = false;
      setIsVideoEnabled(false);
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
          try { await pc.addIceCandidate(c); } catch (e) { console.warn("[WebRTC] Failed to add queued ICE candidate", e); }
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
          try { await pc.addIceCandidate(c); } catch (e) { console.warn("[WebRTC] Failed to add queued ICE candidate", e); }
        }
        pendingIceCandidatesRef.current = [];
        break;
      }
      case "media-state": {
        setRemoteMedia(message.payload);
        break;
      }
      case "ice-candidate": {
        const candidate = new RTCIceCandidate(message.payload);
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(candidate); } catch (e) { console.warn("[WebRTC] Failed to add ICE candidate", e); }
        } else {
          pendingIceCandidatesRef.current.push(candidate);
        }
        break;
      }
    }
  }, [sendSignal]);

  const setupCall = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await startLocalStream();
    } catch (error) {
      console.error("[WebRTC] No microphone:", error);
      handleEndCall("no-media");
      return;
    }
    try {
      console.log("[WebRTC] Setting up call, isIncoming:", isIncoming);
      await loadIceServers();
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
      handleEndCall("failed");
    }
  }, [startLocalStream, createPeerConnection, isIncoming, sendSignal, processSignal, createAndSendOffer, handleEndCall]);

  const handleSignal = useCallback(
    async (message: SignalMessage) => {
      if (message.from !== remoteUserId || message.to !== currentUserId) return;

      if (message.type === "ready") {
        remoteReadyRef.current = true;
        setRemoteReady(true);
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
      if (track) {
        track.enabled = !track.enabled;
        setIsVideoEnabled(track.enabled);
        if (!screenStreamRef.current) sendMediaState({ video: track.enabled });
      }
    }
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsAudioEnabled(track.enabled);
        sendMediaState({ audio: track.enabled });
      }
    }
  };

  const toggleSpeaker = () => setIsSpeakerMuted((m) => !m);

  const stopScreenShare = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    const camStream = localStreamRef.current;
    if (camStream) {
      const videoTrack = camStream.getVideoTracks()[0];
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender && videoTrack) await sender.replaceTrack(videoTrack);
      setLocalPreview(camStream);
      sendMediaState({ screen: false, video: !!videoTrack?.enabled });
    }
    setIsScreenSharing(false);
  }, [sendMediaState]);

  const stopScreenShareRef = useRef(stopScreenShare);
  stopScreenShareRef.current = stopScreenShare;

  const startScreenShare = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: SCREEN_SHARE_VIDEO, audio: true });
      screenStreamRef.current = screen;
      const videoTrack = screen.getVideoTracks()[0];
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(videoTrack);
      } else {
        // No existing video sender (e.g. voice-only fallback) — add a new one
        pc.addTrack(videoTrack, screen);
      }
      setLocalPreview(screen);
      // "Stop sharing" in the browser's own bar ends it too.
      videoTrack.onended = () => stopScreenShareRef.current();
      setIsScreenSharing(true);
      sendMediaState({ screen: true, video: true });
    } catch (err) {
      console.log("[WebRTC] Screen share cancelled or failed:", err);
    }
  }, [sendMediaState]);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  }, [isScreenSharing, stopScreenShare, startScreenShare]);

  const facingModeRef = useRef<"user" | "environment">("user");

  const switchCamera = useCallback(async () => {
    if (!localStreamRef.current || isVoiceOnly) return;
    const track = localStreamRef.current.getVideoTracks()[0];
    if (!track) return;
    const newFacingMode = facingModeRef.current === "user" ? "environment" : "user";
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: newFacingMode }, width: { ideal: 1280 }, height: { ideal: 720 } },
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
      if (!screenStreamRef.current) setLocalPreview(new MediaStream(localStreamRef.current.getTracks()));
      facingModeRef.current = newFacingMode;
    } catch (err) {
      console.log("[WebRTC] Camera switch failed:", err);
    }
  }, [isVoiceOnly]);

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const togglePiP = async () => {
    if (!remoteVideoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await remoteVideoRef.current.requestPictureInPicture();
      }
    } catch (e) {
      console.warn("Picture-in-picture is not available", e);
    }
  };

  // Periodically re-send "ready" signal until connected, handles missed broadcasts
  const resendReadyIfNeeded = useEffectEvent(() => {
    if (
      setupCompleteRef.current &&
      channelReadyRef.current &&
      peerConnectionRef.current &&
      peerConnectionRef.current.connectionState !== "connected"
    ) {
      console.log("[WebRTC] Re-sending ready signal");
      signalingChannelRef.current?.send({
        type: "broadcast",
        event: "signal",
        payload: { type: "ready", payload: {}, from: currentUserId, to: remoteUserId },
      });
      // If caller and remote was already ready but offer wasn't sent, retry
      if (!isIncoming && remoteReadyRef.current && !hasCreatedOfferRef.current) {
        createAndSendOffer(peerConnectionRef.current);
      }
    }
  });

  // Give up if the call hasn't connected within 50 seconds (the other side stops ringing after 45).
  const endIfNotConnected = useEffectEvent(() => {
    if (!peerConnectionRef.current || peerConnectionRef.current.connectionState !== "connected") {
      console.log("[WebRTC] Connection timeout - ending call");
      handleEndCall(remoteReadyRef.current || isIncoming ? "failed" : "no-answer");
    }
  });

  const leaveCall = useEffectEvent(() => cleanup());

  // Subscribe to signaling channel and set up the call once on mount; tear down on unmount.
  const startCall = useEffectEvent(() => {
    console.log("[WebRTC] Mounting VideoCall, roomId:", roomId, "isIncoming:", isIncoming);

    const channel = supabase
      .channel(`video-call-${roomId}`)
      .on("broadcast", { event: "signal" }, ({ payload }) => {
        handleSignalRef.current?.(payload as SignalMessage);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          console.log("[WebRTC] Signaling channel subscribed");
          channelReadyRef.current = true;
          setTimeout(() => setupCallRef.current?.(), 500);
        }
      });

    signalingChannelRef.current = channel;

    const readyInterval = setInterval(resendReadyIfNeeded, 2000);
    const connectTimeout = setTimeout(endIfNotConnected, 50000);

    return () => {
      clearInterval(readyInterval);
      clearTimeout(connectTimeout);
      leaveCall();
    };
  });

  useEffect(() => startCall(), [startCall]);

  const qualityColor = signalQuality === "good" ? "bg-green-500" : signalQuality === "fair" ? "bg-yellow-500" : "bg-red-500";
  const statusText = isConnected
    ? formatCallDuration(callDuration)
    : callDuration > 0
      ? "Reconnecting…"
      : !isIncoming && !remoteReady
        ? "Ringing…"
        : "Connecting…";
  const showRemoteVideo = !isVoiceOnly && !!remoteStream && (remoteMedia.video || remoteMedia.screen);
  const initial = remoteUserName?.[0]?.toUpperCase() || "U";
  const micButton = (size: "sm" | "md") => (
    <CallButton label={isAudioEnabled ? "Mute microphone" : "Unmute microphone"} tone={isAudioEnabled ? "default" : "off"} size={size} onClick={toggleAudio}>
      {isAudioEnabled ? <Mic /> : <MicOff />}
    </CallButton>
  );
  const endButton = (size: "sm" | "lg") => (
    <CallButton label="End call" tone="end" size={size} onClick={() => handleEndCall("hangup")}>
      <PhoneOff />
    </CallButton>
  );

  return (
    <>
      {/* Sound plays from here in both layouts, so switching layout never interrupts it. */}
      <StreamAudio stream={remoteStream} muted={isSpeakerMuted} />

      {isFullscreen ? (
        <div
          role="dialog"
          aria-label={`${isVoiceOnly ? "Voice" : "Video"} call with ${remoteUserName}`}
          className={cn(
            "fixed inset-0 z-50 flex flex-col text-white animate-in fade-in-0 duration-200",
            isVoiceOnly ? "bg-gradient-to-b from-neutral-900 via-neutral-950 to-black" : "bg-black"
          )}
        >
          {/* Header */}
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 px-4 pb-6 pt-[calc(env(safe-area-inset-top)+0.75rem)] bg-gradient-to-b from-black/70 to-transparent">
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", isConnected ? qualityColor : "bg-yellow-500 animate-pulse")} />
              <span className="text-sm font-medium truncate">
                {isScreenSharing ? "You're sharing your screen" : remoteMedia.screen ? `${remoteUserName} is sharing their screen` : isVoiceOnly ? "Voice call" : "Video call"}
              </span>
              {isConnected && <span className="text-sm text-white/70 font-mono tabular-nums">{formatCallDuration(callDuration)}</span>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isConnected && showRemoteVideo && "pictureInPictureEnabled" in document && (
                <CallButton label="Picture in picture" size="sm" onClick={togglePiP} className="bg-transparent hover:bg-white/15">
                  <PictureInPicture2 />
                </CallButton>
              )}
              <CallButton label="Minimize call" size="sm" onClick={() => setIsFullscreen(false)} className="bg-transparent hover:bg-white/15">
                <Minimize2 />
              </CallButton>
            </div>
          </div>

          {/* The other person */}
          <div className="relative flex-1 overflow-hidden">
            {showRemoteVideo ? (
              <StreamVideo
                ref={remoteVideoRef}
                data-remote
                stream={remoteStream}
                className={cn("h-full w-full", remoteMedia.screen ? "object-contain" : "object-cover sm:object-contain")}
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
                <div className="relative">
                  {!isConnected && [0, 1].map((i) => (
                    <span
                      key={i}
                      className="absolute inset-0 rounded-full border-2 border-white/20 animate-ping"
                      style={{ animationDelay: `${i * 700}ms`, animationDuration: "2s" }}
                    />
                  ))}
                  <Avatar className="h-28 w-28 sm:h-32 sm:w-32 ring-4 ring-white/10">
                    <AvatarImage src={remoteUserAvatar || undefined} alt="" />
                    <AvatarFallback className="text-4xl bg-primary/30 text-white">{initial}</AvatarFallback>
                  </Avatar>
                </div>
                <p className="mt-5 text-2xl font-semibold">{remoteUserName}</p>
                <p className="mt-1 text-sm text-white/60 tabular-nums" aria-live="polite">
                  {statusText}
                  {isConnected && !isVoiceOnly && !remoteMedia.video && " · camera off"}
                </p>
              </div>
            )}

            {isConnected && !remoteMedia.audio && (
              <div className="absolute left-1/2 top-[calc(env(safe-area-inset-top)+4rem)] -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs backdrop-blur">
                <MicOff className="h-3.5 w-3.5" /> {remoteUserName} is muted
              </div>
            )}

            {/* You */}
            {!isVoiceOnly && (
              <div className="absolute bottom-28 right-4 h-40 w-28 sm:bottom-28 sm:right-6 sm:h-56 sm:w-40 overflow-hidden rounded-2xl border border-white/20 bg-neutral-800 shadow-2xl">
                {isVideoEnabled || isScreenSharing ? (
                  <StreamVideo
                    stream={localPreview}
                    mirror={!isScreenSharing && facingModeRef.current === "user"}
                    className={cn("h-full w-full", isScreenSharing ? "object-contain bg-black" : "object-cover")}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <VideoOff className="h-6 w-6 text-white/50" />
                  </div>
                )}
                <span className="absolute bottom-1.5 left-2 text-[11px] font-medium text-white/90 drop-shadow">You</span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2.5 sm:gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 pt-8 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            {micButton("md")}
            {!isVoiceOnly && (
              <CallButton label={isVideoEnabled ? "Turn camera off" : "Turn camera on"} tone={isVideoEnabled ? "default" : "off"} onClick={toggleVideo}>
                {isVideoEnabled ? <Video /> : <VideoOff />}
              </CallButton>
            )}
            {endButton("lg")}
            {!isVoiceOnly && isConnected && canShareScreen() && (
              <CallButton label={isScreenSharing ? "Stop sharing screen" : "Share screen"} tone={isScreenSharing ? "on" : "default"} onClick={toggleScreenShare}>
                {isScreenSharing ? <MonitorOff /> : <Monitor />}
              </CallButton>
            )}
            {!isVoiceOnly && isConnected && !canShareScreen() && (
              <CallButton label="Switch camera" onClick={switchCamera}>
                <SwitchCamera />
              </CallButton>
            )}
            <CallButton label={isSpeakerMuted ? "Turn sound on" : "Turn sound off"} tone={isSpeakerMuted ? "off" : "default"} onClick={toggleSpeaker}>
              {isSpeakerMuted ? <VolumeX /> : <Volume2 />}
            </CallButton>
          </div>
        </div>
      ) : (
        /* Minimized: a small window you can drag anywhere while you keep using the app. */
        <div
          ref={drag.ref}
          style={drag.style}
          {...drag.handlers}
          role="dialog"
          aria-label={`${isVoiceOnly ? "Voice" : "Video"} call with ${remoteUserName}`}
          className={cn(
            "fixed z-50 bottom-24 right-3 md:bottom-6 md:right-6 touch-none select-none cursor-grab active:cursor-grabbing",
            "overflow-hidden text-white shadow-2xl ring-1 ring-white/10 animate-in fade-in-0 zoom-in-95 duration-200",
            showRemoteVideo ? "h-60 w-40 sm:h-64 sm:w-44 rounded-2xl bg-black" : "w-[min(20rem,calc(100vw-1.5rem))] rounded-full bg-neutral-900/95 backdrop-blur-xl"
          )}
        >
          {showRemoteVideo ? (
            <>
              <StreamVideo
                ref={remoteVideoRef}
                data-remote
                stream={remoteStream}
                className={cn("absolute inset-0 h-full w-full pointer-events-none", remoteMedia.screen ? "object-contain" : "object-cover")}
              />
              <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-1 bg-gradient-to-b from-black/70 to-transparent p-2">
                <span className="truncate text-xs font-medium">{remoteUserName}</span>
                <span className="text-[11px] font-mono tabular-nums text-white/80">{statusText}</span>
              </div>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
                {micButton("sm")}
                <CallButton label="Expand call" size="sm" onClick={() => setIsFullscreen(true)}>
                  <Maximize2 />
                </CallButton>
                {endButton("sm")}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2.5 p-2 pl-2.5">
              <Avatar className={cn("h-10 w-10 shrink-0 ring-2", isConnected ? "ring-green-500/70" : "ring-yellow-500/70 animate-pulse")}>
                <AvatarImage src={remoteUserAvatar || undefined} alt="" />
                <AvatarFallback className="bg-primary/30 text-white">{initial}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight">{remoteUserName}</p>
                <p className="truncate text-xs text-white/60 tabular-nums">
                  {statusText}
                  {isConnected && !remoteMedia.audio && " · muted"}
                </p>
              </div>
              {micButton("sm")}
              <CallButton label="Expand call" size="sm" onClick={() => setIsFullscreen(true)}>
                <Maximize2 />
              </CallButton>
              {endButton("sm")}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default VideoCall;
