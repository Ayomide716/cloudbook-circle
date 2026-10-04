import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Video, VideoOff, Mic, MicOff, PhoneOff,
  Monitor, MonitorOff, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getIceServers } from "@/lib/webrtc";

interface Participant {
  userId: string;
  userName: string;
  userAvatar?: string | null;
  stream?: MediaStream;
  pc?: RTCPeerConnection;
}

interface GroupVideoCallProps {
  groupId: string;
  groupName: string;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string | null;
  isVoiceOnly?: boolean;
  onEnd: () => void;
}

const GroupVideoCall = ({
  groupId, groupName, currentUserId, currentUserName, currentUserAvatar,
  isVoiceOnly = false, onEnd,
}: GroupVideoCallProps) => {
  const [participants, setParticipants] = useState<Map<string, Participant>>(new Map());
  const [isVideoEnabled, setIsVideoEnabled] = useState(!isVoiceOnly);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  const roomChannel = `group-call-${groupId}`;

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const cleanup = useCallback(() => {
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    if (channelRef.current) {
      // Notify others we're leaving
      channelRef.current.send({
        type: "broadcast",
        event: "participant-left",
        payload: { userId: currentUserId },
      });
      supabase.removeChannel(channelRef.current);
    }
  }, [currentUserId]);

  const createPeerConnection = useCallback((remoteUserId: string) => {
    const pc = new RTCPeerConnection({ iceServers: getIceServers(), iceCandidatePoolSize: 10 });

    pc.onicecandidate = (event) => {
      if (event.candidate && channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "ice-candidate",
          payload: { from: currentUserId, to: remoteUserId, candidate: event.candidate },
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        setParticipants(prev => {
          const updated = new Map(prev);
          const p = updated.get(remoteUserId);
          if (p) {
            updated.set(remoteUserId, { ...p, stream: event.streams[0] });
          }
          return updated;
        });
        // Set video element srcObject
        setTimeout(() => {
          const videoEl = remoteVideoRefs.current.get(remoteUserId);
          if (videoEl && event.streams[0]) {
            videoEl.srcObject = event.streams[0];
            videoEl.play().catch(() => {});
          }
        }, 100);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") pc.restartIce();
    };

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current!));
    }

    peerConnectionsRef.current.set(remoteUserId, pc);
    return pc;
  }, [currentUserId]);

  const handleOffer = useCallback(async (fromUserId: string, offer: RTCSessionDescriptionInit) => {
    let pc = peerConnectionsRef.current.get(fromUserId);
    if (!pc) pc = createPeerConnection(fromUserId);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    channelRef.current?.send({
      type: "broadcast",
      event: "answer",
      payload: { from: currentUserId, to: fromUserId, answer },
    });
  }, [currentUserId, createPeerConnection]);

  const handleAnswer = useCallback(async (fromUserId: string, answer: RTCSessionDescriptionInit) => {
    const pc = peerConnectionsRef.current.get(fromUserId);
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }, []);

  const handleIceCandidate = useCallback(async (fromUserId: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionsRef.current.get(fromUserId);
    if (pc) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) { console.warn("[WebRTC] Failed to add ICE candidate", e); }
    }
  }, []);

  const connectToParticipant = useCallback(async (remoteUserId: string) => {
    if (remoteUserId === currentUserId) return;
    if (peerConnectionsRef.current.has(remoteUserId)) return;

    const pc = createPeerConnection(remoteUserId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    channelRef.current?.send({
      type: "broadcast",
      event: "offer",
      payload: { from: currentUserId, to: remoteUserId, offer },
    });
  }, [currentUserId, createPeerConnection]);

  useEffect(() => {
    const init = async () => {
      // Get local stream
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: !isVoiceOnly ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } } : false,
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        localStreamRef.current = stream;
        if (localVideoRef.current && !isVoiceOnly) localVideoRef.current.srcObject = stream;
      } catch {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
      }

      // Join signaling channel
      const channel = supabase.channel(roomChannel);

      channel
        .on("broadcast", { event: "participant-joined" }, async ({ payload }) => {
          if (payload.userId === currentUserId) return;
          setParticipants(prev => {
            const updated = new Map(prev);
            if (!updated.has(payload.userId)) {
              updated.set(payload.userId, {
                userId: payload.userId,
                userName: payload.userName,
                userAvatar: payload.userAvatar,
              });
            }
            return updated;
          });
          // Send offer to new participant
          await connectToParticipant(payload.userId);
        })
        .on("broadcast", { event: "participant-left" }, ({ payload }) => {
          const pc = peerConnectionsRef.current.get(payload.userId);
          if (pc) { pc.close(); peerConnectionsRef.current.delete(payload.userId); }
          setParticipants(prev => {
            const updated = new Map(prev);
            updated.delete(payload.userId);
            return updated;
          });
        })
        .on("broadcast", { event: "offer" }, async ({ payload }) => {
          if (payload.to !== currentUserId) return;
          // Add participant if not exists
          setParticipants(prev => {
            const updated = new Map(prev);
            if (!updated.has(payload.from)) {
              updated.set(payload.from, { userId: payload.from, userName: "Participant", userAvatar: null });
            }
            return updated;
          });
          await handleOffer(payload.from, payload.offer);
        })
        .on("broadcast", { event: "answer" }, async ({ payload }) => {
          if (payload.to !== currentUserId) return;
          await handleAnswer(payload.from, payload.answer);
        })
        .on("broadcast", { event: "ice-candidate" }, async ({ payload }) => {
          if (payload.to !== currentUserId) return;
          await handleIceCandidate(payload.from, payload.candidate);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            // Announce ourselves
            await channel.send({
              type: "broadcast",
              event: "participant-joined",
              payload: { userId: currentUserId, userName: currentUserName, userAvatar: currentUserAvatar },
            });
          }
        });

      channelRef.current = channel;

      // Start call timer
      callTimerRef.current = setInterval(() => setCallDuration(p => p + 1), 1000);
    };

    init();
    return () => cleanup();
  }, []);

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

  const stopScreenShareRef = useRef<() => void>(() => {});

  const stopScreenSharing = useCallback(() => {
    if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    const camTrack = localStreamRef.current?.getVideoTracks()[0];
    if (camTrack) {
      peerConnectionsRef.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === "video");
        if (sender) sender.replaceTrack(camTrack);
      });
    }
    if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    setIsScreenSharing(false);
  }, []);

  stopScreenShareRef.current = stopScreenSharing;

  const startScreenSharing = useCallback(async () => {
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = screen;
      const videoTrack = screen.getVideoTracks()[0];
      peerConnectionsRef.current.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === "video");
        if (sender) {
          sender.replaceTrack(videoTrack);
        } else {
          pc.addTrack(videoTrack, screen);
        }
      });
      if (localVideoRef.current) localVideoRef.current.srcObject = screen;
      videoTrack.onended = () => stopScreenShareRef.current();
      setIsScreenSharing(true);
    } catch (err) {
      console.log("[GroupCall] Screen share cancelled:", err);
    }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      stopScreenSharing();
    } else {
      await startScreenSharing();
    }
  }, [isScreenSharing, stopScreenSharing, startScreenSharing]);

  const handleEndCall = () => {
    cleanup();
    onEnd();
  };

  const participantArray = Array.from(participants.values());
  const totalParticipants = participantArray.length + 1; // +1 for self
  const gridCols = totalParticipants <= 1 ? 1 : totalParticipants <= 4 ? 2 : 3;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/70 to-transparent flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white/10 rounded-full px-3 py-1">
            <Users className="h-4 w-4 text-white" />
            <span className="text-white text-sm">{totalParticipants}</span>
          </div>
          <span className="text-white font-medium">{groupName}</span>
          <span className="text-white/60 font-mono text-sm">{formatDuration(callDuration)}</span>
        </div>
      </div>

      {/* Video Grid */}
      <div className={cn("flex-1 p-4 pt-16 pb-24 grid gap-2", `grid-cols-${gridCols}`)}>
        {/* Self */}
        <div className="relative bg-muted/20 rounded-2xl overflow-hidden">
          {!isVoiceOnly ? (
            <video
              ref={localVideoRef}
              autoPlay playsInline muted
              className={cn("w-full h-full object-cover", !isVideoEnabled && "hidden")}
            />
          ) : null}
          {(isVoiceOnly || !isVideoEnabled) && (
            <div className="w-full h-full flex items-center justify-center">
              <Avatar className="h-20 w-20">
                <AvatarImage src={currentUserAvatar || undefined} />
                <AvatarFallback className="text-2xl">{currentUserName?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
            </div>
          )}
          <div className="absolute bottom-2 left-2 bg-black/60 rounded-full px-2 py-0.5 text-xs text-white">
            You {!isAudioEnabled && "🔇"}
          </div>
        </div>

        {/* Remote participants */}
        {participantArray.map((p) => (
          <div key={p.userId} className="relative bg-muted/20 rounded-2xl overflow-hidden">
            {!isVoiceOnly && p.stream ? (
              <video
                ref={(el) => { if (el) { remoteVideoRefs.current.set(p.userId, el); if (p.stream) { el.srcObject = p.stream; el.play().catch(() => {}); } } }}
                autoPlay playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={p.userAvatar || undefined} />
                  <AvatarFallback className="text-2xl">{p.userName?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black/60 rounded-full px-2 py-0.5 text-xs text-white">
              {p.userName}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pb-8 pt-6 flex items-center justify-center gap-3">
        <Button
          variant={isAudioEnabled ? "secondary" : "destructive"}
          size="icon"
          className={cn("h-12 w-12 rounded-full shadow-md", isAudioEnabled && "bg-white/20 hover:bg-white/30 text-white")}
          onClick={toggleAudio}
        >
          {isAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>

        <Button variant="destructive" size="icon" className="h-14 w-14 rounded-full shadow-lg" onClick={handleEndCall}>
          <PhoneOff className="h-6 w-6" />
        </Button>

        {!isVoiceOnly && (
          <Button
            variant={isVideoEnabled ? "secondary" : "destructive"}
            size="icon"
            className={cn("h-12 w-12 rounded-full shadow-md", isVideoEnabled && "bg-white/20 hover:bg-white/30 text-white")}
            onClick={toggleVideo}
          >
            {isVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </Button>
        )}

        {!isVoiceOnly && (
          <Button
            variant={isScreenSharing ? "default" : "secondary"}
            size="icon"
            className={cn("h-12 w-12 rounded-full shadow-md", !isScreenSharing && "bg-white/20 hover:bg-white/30 text-white")}
            onClick={toggleScreenShare}
          >
            {isScreenSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
          </Button>
        )}
      </div>
    </div>
  );
};

export default GroupVideoCall;
