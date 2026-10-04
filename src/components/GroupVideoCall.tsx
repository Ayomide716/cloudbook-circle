import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { useDraggable } from "@/hooks/use-draggable";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Maximize2, Mic, MicOff, Minimize2, Monitor, MonitorOff, PhoneOff, Users, Video, VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { canShareScreen, formatCallDuration, getIceServers } from "@/lib/webrtc";
import { freshChannel } from "@/lib/realtime-broadcast";
import { CallButton, StreamAudio, StreamVideo } from "@/components/calls/CallControls";
import { toast } from "@/hooks/use-toast";

interface GroupVideoCallProps {
  groupId: string;
  groupName: string;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string | null;
  isVoiceOnly?: boolean;
  onEnd: () => void;
}

/** What each person publishes about themselves through presence. */
interface PresenceInfo {
  name: string;
  avatar: string | null;
  audio: boolean;
  video: boolean;
  screen: boolean;
}

interface Peer extends PresenceInfo {
  userId: string;
  stream: MediaStream | null;
  connected: boolean;
}

type Signal =
  | { type: "offer" | "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; from: string; to: string; candidate: RTCIceCandidateInit };

// Phones get a single column for two people; bigger screens a proper grid.
const GRID: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-2",
  4: "grid-cols-2",
};

/**
 * Group voice/video call: every pair of people has its own peer connection (a mesh), which
 * suits small groups. Who is in the call comes from Realtime presence, so people who close
 * the tab disappear on their own. Of each pair, the person with the smaller id makes the
 * offer, so two people never offer to each other at once.
 */
const GroupVideoCall = ({
  groupId, groupName, currentUserId, currentUserName, currentUserAvatar,
  isVoiceOnly = false, onEnd,
}: GroupVideoCallProps) => {
  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const [localPreview, setLocalPreview] = useState<MediaStream | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(!isVoiceOnly);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const drag = useDraggable<HTMLDivElement>();

  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pcsRef = useRef(new Map<string, { pc: RTCPeerConnection; createdAt: number }>());
  const pendingIceRef = useRef(new Map<string, RTCIceCandidateInit[]>());
  const presenceRef = useRef<PresenceInfo>({
    name: currentUserName, avatar: currentUserAvatar ?? null, audio: true, video: !isVoiceOnly, screen: false,
  });

  const updatePeer = useCallback((userId: string, patch: Partial<Peer>) => {
    setPeers((prev) => (prev[userId] ? { ...prev, [userId]: { ...prev[userId], ...patch } } : prev));
  }, []);

  const sendSignal = useCallback((signal: Signal) => {
    channelRef.current?.send({ type: "broadcast", event: "signal", payload: signal });
  }, []);

  const publish = useCallback((patch: Partial<PresenceInfo>) => {
    presenceRef.current = { ...presenceRef.current, ...patch };
    channelRef.current?.track(presenceRef.current);
  }, []);

  const closePeer = useCallback((userId: string) => {
    pcsRef.current.get(userId)?.pc.close();
    pcsRef.current.delete(userId);
    pendingIceRef.current.delete(userId);
  }, []);

  const createPeer = useCallback((userId: string) => {
    closePeer(userId);
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });
    pcsRef.current.set(userId, { pc, createdAt: Date.now() });

    const local = localStreamRef.current;
    if (local) {
      for (const track of local.getTracks()) {
        // Someone joining mid-share sees the screen straight away.
        const screenTrack = track.kind === "video" ? screenStreamRef.current?.getVideoTracks()[0] : undefined;
        pc.addTrack(screenTrack ?? track, local);
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) sendSignal({ type: "ice", from: currentUserId, to: userId, candidate: e.candidate.toJSON() });
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      updatePeer(userId, { stream });
    };
    pc.onconnectionstatechange = () => {
      console.log("[GroupCall]", userId.slice(0, 8), pc.connectionState);
      updatePeer(userId, { connected: pc.connectionState === "connected" });
    };
    return pc;
  }, [closePeer, currentUserId, sendSignal, updatePeer]);

  const flushIce = async (userId: string, pc: RTCPeerConnection) => {
    const queued = pendingIceRef.current.get(userId) ?? [];
    pendingIceRef.current.delete(userId);
    for (const c of queued) {
      try { await pc.addIceCandidate(c); } catch (e) { console.warn("[GroupCall] Bad ICE candidate", e); }
    }
  };

  const callPeer = useCallback(async (userId: string) => {
    const pc = createPeer(userId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ type: "offer", from: currentUserId, to: userId, sdp: offer });
  }, [createPeer, currentUserId, sendSignal]);

  const onSignal = useEffectEvent(async (signal: Signal) => {
    if (signal.to !== currentUserId) return;
    const { from } = signal;
    try {
      if (signal.type === "offer") {
        const pc = createPeer(from);
        await pc.setRemoteDescription(signal.sdp);
        await flushIce(from, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ type: "answer", from: currentUserId, to: from, sdp: answer });
      } else if (signal.type === "answer") {
        const pc = pcsRef.current.get(from)?.pc;
        if (pc?.signalingState !== "have-local-offer") return;
        await pc.setRemoteDescription(signal.sdp);
        await flushIce(from, pc);
      } else if (signal.type === "ice") {
        const pc = pcsRef.current.get(from)?.pc;
        if (pc?.remoteDescription) {
          await pc.addIceCandidate(signal.candidate);
        } else {
          // Candidates can arrive before the offer/answer they belong to: keep them for later.
          pendingIceRef.current.set(from, [...(pendingIceRef.current.get(from) ?? []), signal.candidate]);
        }
      }
    } catch (e) {
      console.warn("[GroupCall] Signal failed", signal.type, e);
    }
  });

  const onPresenceSync = useEffectEvent(() => {
    const channel = channelRef.current;
    if (!channel) return;
    const state = channel.presenceState<PresenceInfo>();
    const present = new Set(Object.keys(state).filter((id) => id !== currentUserId));

    setPeers((prev) => {
      const next: Record<string, Peer> = {};
      for (const id of present) {
        const info = state[id][state[id].length - 1];
        next[id] = {
          userId: id,
          name: info.name,
          avatar: info.avatar,
          audio: info.audio,
          video: info.video,
          screen: info.screen,
          stream: prev[id]?.stream ?? null,
          connected: prev[id]?.connected ?? false,
        };
      }
      return next;
    });

    for (const id of pcsRef.current.keys()) if (!present.has(id)) closePeer(id);
    for (const id of present) {
      if (!pcsRef.current.has(id) && currentUserId < id) callPeer(id);
    }
  });

  // Retry pairs that never connected (a lost offer) or dropped.
  const retryStuckPeers = useEffectEvent(() => {
    for (const [id, { pc, createdAt }] of pcsRef.current) {
      const stuck = pc.connectionState === "failed" || (pc.connectionState !== "connected" && Date.now() - createdAt > 12_000);
      if (stuck && currentUserId < id) callPeer(id);
    }
  });

  const join = useEffectEvent(async (isCancelled: () => boolean) => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: isVoiceOnly ? false : { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        presenceRef.current.video = false;
        setIsVideoEnabled(false);
      } catch {
        toast({ title: "Can't reach your microphone", description: "Allow microphone access in your browser to join calls.", variant: "destructive" });
        onEnd();
        return;
      }
    }
    if (isCancelled()) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    localStreamRef.current = stream;
    setLocalPreview(stream);

    const channel = await freshChannel(`group-call-${groupId}`, { config: { presence: { key: currentUserId } } });
    if (isCancelled()) {
      supabase.removeChannel(channel);
      return;
    }
    channelRef.current = channel;
    channel
      .on("presence", { event: "sync" }, () => onPresenceSync())
      .on("broadcast", { event: "signal" }, ({ payload }) => onSignal(payload as Signal))
      .on("broadcast", { event: "room-ended" }, () => onRoomEnded())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") channel.track(presenceRef.current);
      });
  });

  // A voice room's creator ended it.
  const onRoomEnded = useEffectEvent(() => {
    toast({ title: `${groupName} was ended` });
    leave();
    onEnd();
  });

  const leave = useEffectEvent(() => {
    for (const id of [...pcsRef.current.keys()]) closePeer(id);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = null;
  });

  useEffect(() => {
    let cancelled = false;
    join(() => cancelled);
    const timer = setInterval(() => setCallDuration((d) => d + 1), 1000);
    const retry = setInterval(retryStuckPeers, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearInterval(retry);
      leave();
    };
  }, [join, leave, retryStuckPeers]);

  const toggleAudio = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsAudioEnabled(track.enabled);
    publish({ audio: track.enabled });
  };

  const toggleVideo = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsVideoEnabled(track.enabled);
    if (!screenStreamRef.current) publish({ video: track.enabled });
  };

  const replaceOutgoingVideo = (track: MediaStreamTrack) => {
    for (const { pc } of pcsRef.current.values()) {
      pc.getSenders().find((s) => s.track?.kind === "video")?.replaceTrack(track);
    }
  };

  const stopScreenShare = useEffectEvent(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    const cam = localStreamRef.current?.getVideoTracks()[0];
    if (cam) replaceOutgoingVideo(cam);
    setLocalPreview(localStreamRef.current);
    setIsScreenSharing(false);
    publish({ screen: false, video: !!cam?.enabled });
  });

  const startScreenShare = async () => {
    if (!localStreamRef.current?.getVideoTracks()[0]) return;
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = screen.getVideoTracks()[0];
      screenStreamRef.current = screen;
      replaceOutgoingVideo(track);
      track.onended = () => stopScreenShare();
      setLocalPreview(screen);
      setIsScreenSharing(true);
      publish({ screen: true, video: true });
    } catch (err) {
      console.log("[GroupCall] Screen share cancelled:", err);
    }
  };

  const handleLeave = () => {
    leave();
    onEnd();
  };

  const peerList = Object.values(peers);
  const total = peerList.length + 1;
  const presenter = peerList.find((p) => p.screen);
  const others = presenter ? peerList.filter((p) => p !== presenter) : peerList;
  const me: Peer = {
    userId: currentUserId,
    name: "You",
    avatar: currentUserAvatar ?? null,
    audio: isAudioEnabled,
    video: !isVoiceOnly && (isVideoEnabled || isScreenSharing),
    screen: isScreenSharing,
    stream: localPreview,
    connected: true,
  };

  const tile = (p: Peer, isSelf: boolean, compact = false) => (
    <div key={p.userId} className={cn("relative overflow-hidden rounded-2xl bg-neutral-800/80", compact ? "h-full aspect-[3/4] shrink-0" : "h-full min-h-0 w-full")}>
      {!isVoiceOnly && p.video && p.stream ? (
        <StreamVideo
          stream={p.stream}
          mirror={isSelf && !p.screen}
          className={cn("h-full w-full", p.screen ? "object-contain bg-black" : "object-cover")}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Avatar className={cn(compact ? "h-12 w-12" : "h-16 w-16 sm:h-20 sm:w-20", !isSelf && !p.connected && "opacity-60")}>
            <AvatarImage src={p.avatar || undefined} alt="" />
            <AvatarFallback className="text-xl bg-primary/30 text-white">
              {(isSelf ? currentUserName : p.name)?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white backdrop-blur">
        {!p.audio && <MicOff className="h-3 w-3 shrink-0 text-red-400" aria-label="Muted" />}
        <span className="truncate">{p.name}</span>
        {!isSelf && !p.connected && <span className="text-white/60">· connecting</span>}
      </div>
    </div>
  );

  const micButton = (size: "sm" | "md") => (
    <CallButton label={isAudioEnabled ? "Mute microphone" : "Unmute microphone"} tone={isAudioEnabled ? "default" : "off"} size={size} onClick={toggleAudio}>
      {isAudioEnabled ? <Mic /> : <MicOff />}
    </CallButton>
  );

  return (
    <>
      {/* Everyone's sound, kept mounted in both layouts. */}
      {peerList.map((p) => <StreamAudio key={p.userId} stream={p.stream} />)}

      {isFullscreen ? (
        <div role="dialog" aria-label={`Group call in ${groupName}`} className="fixed inset-0 z-50 flex flex-col bg-neutral-950 text-white animate-in fade-in-0 duration-200">
          <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-sm">
                <Users className="h-4 w-4" /> {total}
              </span>
              <span className="truncate font-medium">{groupName}</span>
              <span className="font-mono text-sm tabular-nums text-white/60">{formatCallDuration(callDuration)}</span>
            </div>
            <CallButton label="Minimize call" size="sm" onClick={() => setIsFullscreen(false)} className="bg-transparent hover:bg-white/15">
              <Minimize2 />
            </CallButton>
          </div>

          {presenter ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 pb-28">
              <div className="min-h-0 flex-1">{tile(presenter, false)}</div>
              <div className="flex h-28 gap-2 overflow-x-auto">
                {tile(me, true, true)}
                {others.map((p) => tile(p, false, true))}
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "grid min-h-0 flex-1 auto-rows-fr gap-2 px-3 pb-28",
                GRID[total] ?? "grid-cols-2 md:grid-cols-3"
              )}
            >
              {tile(me, true)}
              {peerList.map((p) => tile(p, false))}
              {peerList.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 p-6 text-center text-sm text-white/60">
                  <Users className="mb-2 h-6 w-6" />
                  Waiting for others to join…
                </div>
              )}
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2.5 sm:gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 pt-8 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
            {micButton("md")}
            {!isVoiceOnly && (
              <CallButton label={isVideoEnabled ? "Turn camera off" : "Turn camera on"} tone={isVideoEnabled ? "default" : "off"} onClick={toggleVideo}>
                {isVideoEnabled ? <Video /> : <VideoOff />}
              </CallButton>
            )}
            <CallButton label="Leave call" tone="end" size="lg" onClick={handleLeave}>
              <PhoneOff />
            </CallButton>
            {!isVoiceOnly && canShareScreen() && (
              <CallButton
                label={isScreenSharing ? "Stop sharing screen" : "Share screen"}
                tone={isScreenSharing ? "on" : "default"}
                onClick={() => (isScreenSharing ? stopScreenShare() : startScreenShare())}
              >
                {isScreenSharing ? <MonitorOff /> : <Monitor />}
              </CallButton>
            )}
          </div>
        </div>
      ) : (
        <div
          ref={drag.ref}
          style={drag.style}
          {...drag.handlers}
          role="dialog"
          aria-label={`Group call in ${groupName}`}
          className="fixed z-50 bottom-24 right-3 md:bottom-6 md:right-6 w-[min(20rem,calc(100vw-1.5rem))] touch-none select-none cursor-grab active:cursor-grabbing rounded-3xl bg-neutral-900/95 p-2.5 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-200"
        >
          <div className="flex items-center gap-2.5">
            <div className="flex -space-x-3 shrink-0">
              {[me, ...peerList].slice(0, 2).map((p) => (
                <Avatar key={p.userId} className="h-9 w-9 ring-2 ring-neutral-900">
                  <AvatarImage src={p.avatar || undefined} alt="" />
                  <AvatarFallback className="bg-primary/30 text-white text-xs">
                    {(p.userId === currentUserId ? currentUserName : p.name)?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">{groupName}</p>
              <p className="text-xs text-white/60 tabular-nums">
                {total} in call · {formatCallDuration(callDuration)}
              </p>
            </div>
            {micButton("sm")}
            <CallButton label="Expand call" size="sm" onClick={() => setIsFullscreen(true)}>
              <Maximize2 />
            </CallButton>
            <CallButton label="Leave call" tone="end" size="sm" onClick={handleLeave}>
              <PhoneOff />
            </CallButton>
          </div>
        </div>
      )}
    </>
  );
};

export default GroupVideoCall;
