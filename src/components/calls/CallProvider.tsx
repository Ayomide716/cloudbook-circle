import { lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SessionContext } from "@/lib/session-context";
import { broadcast, userCallTopic } from "@/lib/realtime-broadcast";
import { CallsContext, type CallGroup, type CallPeer, type CallsApi } from "@/hooks/use-calls";
import { useRingtone } from "@/hooks/useRingtone";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { toast } from "@/hooks/use-toast";
import type { CallEndReason } from "@/components/VideoCall";

const VideoCall = lazy(() => import("@/components/VideoCall"));
const GroupVideoCall = lazy(() => import("@/components/GroupVideoCall"));
const IncomingCallOverlay = lazy(() => import("@/components/IncomingCallOverlay"));
const GroupCallInvite = lazy(() => import("@/components/calls/GroupCallInvite"));

/** How long a call rings before it counts as missed. */
const RING_MS = 45_000;

interface IncomingCall extends CallPeer {
  isVoiceOnly: boolean;
}

interface ActiveCall {
  peer: CallPeer;
  isIncoming: boolean;
  isVoiceOnly: boolean;
}

interface GroupInvite {
  group: CallGroup;
  fromName: string;
  fromAvatar?: string | null;
  isVoiceOnly: boolean;
}

/**
 * Rings you for calls on every page and keeps a call going while you move around the app.
 * Each signed-in user listens on their own `calls-<id>` channel; callers send to it.
 */
const CallProvider = ({ children }: { children: ReactNode }) => {
  const session = useContext(SessionContext);
  const userId = session?.user.id ?? null;
  const accessToken = session?.access_token;

  const [me, setMe] = useState<{ name: string; avatar: string | null }>({ name: "Someone", avatar: null });
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [active, setActive] = useState<ActiveCall | null>(null);
  const [groupCall, setGroupCall] = useState<{ group: CallGroup; isVoiceOnly: boolean } | null>(null);
  const [groupInvite, setGroupInvite] = useState<GroupInvite | null>(null);

  useRingtone(!!incoming);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase.from("profiles").select("full_name, avatar_url").eq("id", userId).maybeSingle().then(({ data }) => {
      if (!cancelled && data) setMe({ name: data.full_name || "Someone", avatar: data.avatar_url });
    });
    return () => { cancelled = true; };
  }, [userId]);

  const send = useCallback(
    (to: string, event: string, extra: Record<string, unknown> = {}, keepalive = false) => {
      if (!userId) return;
      broadcast([{ topic: userCallTopic(to), event, payload: { from: userId, to, ...extra } }], { accessToken, keepalive });
    },
    [userId, accessToken]
  );

  const busy = () => !!active || !!groupCall;

  const onSignal = useEffectEvent((event: string, payload: Record<string, unknown>) => {
    if (payload.to !== userId) return;
    const from = String(payload.from);
    const name = String(payload.fromName || "Someone");
    switch (event) {
      case "call-request":
        if (busy() || (incoming && incoming.id !== from)) {
          send(from, "call-busy");
          return;
        }
        setIncoming({ id: from, name, avatar: (payload.fromAvatar as string | null) ?? null, isVoiceOnly: !!payload.isVoiceOnly });
        break;
      case "call-ended":
        if (incoming?.id === from) {
          toast({ title: `Missed call from ${incoming.name}` });
          setIncoming(null);
        }
        if (active?.peer.id === from) setActive(null);
        break;
      case "call-rejected":
        if (active?.peer.id === from) {
          toast({ title: `${active.peer.name} declined the call` });
          setActive(null);
        }
        break;
      case "call-busy":
        if (active?.peer.id === from) {
          toast({ title: `${active.peer.name} is on another call`, description: "Try again in a bit." });
          setActive(null);
        }
        break;
      case "group-call-started":
        if (groupCall?.group.id === payload.groupId) return;
        setGroupInvite({
          group: { id: String(payload.groupId), name: String(payload.groupName || "your group") },
          fromName: name,
          fromAvatar: (payload.fromAvatar as string | null) ?? null,
          isVoiceOnly: !!payload.isVoiceOnly,
        });
        break;
    }
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(userCallTopic(userId));
    for (const event of ["call-request", "call-ended", "call-rejected", "call-busy", "group-call-started"]) {
      channel.on("broadcast", { event }, ({ payload }) => onSignal(event, payload));
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, onSignal]);

  // An unanswered call stops ringing after a while.
  useEffect(() => {
    if (!incoming) return;
    const t = setTimeout(() => {
      toast({ title: `Missed call from ${incoming.name}` });
      setIncoming(null);
    }, RING_MS);
    return () => clearTimeout(t);
  }, [incoming]);

  useEffect(() => {
    if (!groupInvite) return;
    const t = setTimeout(() => setGroupInvite(null), 30_000);
    return () => clearTimeout(t);
  }, [groupInvite]);

  // Closing the tab mid-call still hangs up for the other person.
  const hangUpOnExit = useEffectEvent(() => {
    if (active) send(active.peer.id, "call-ended", {}, true);
  });
  useEffect(() => {
    window.addEventListener("pagehide", hangUpOnExit);
    return () => window.removeEventListener("pagehide", hangUpOnExit);
  }, [hangUpOnExit]);

  // Signing out ends everything.
  useEffect(() => {
    if (userId) return;
    setIncoming(null);
    setActive(null);
    setGroupCall(null);
    setGroupInvite(null);
  }, [userId]);

  const alreadyInCall = () => {
    if (!busy()) return false;
    toast({ title: "You're already in a call", description: "Hang up first to start another one." });
    return true;
  };

  const startCall = useEffectEvent((peer: CallPeer, isVoiceOnly: boolean) => {
    if (!userId || alreadyInCall()) return;
    send(peer.id, "call-request", { fromName: me.name, fromAvatar: me.avatar, isVoiceOnly });
    setActive({ peer, isIncoming: false, isVoiceOnly });
  });

  const startGroupCall = useEffectEvent((group: CallGroup, isVoiceOnly: boolean, memberIds: string[]) => {
    if (!userId || alreadyInCall()) return;
    broadcast(
      memberIds
        .filter((id) => id !== userId)
        .map((id) => ({
          topic: userCallTopic(id),
          event: "group-call-started",
          payload: { from: userId, to: id, fromName: me.name, fromAvatar: me.avatar, groupId: group.id, groupName: group.name, isVoiceOnly },
        })),
      { accessToken }
    );
    setGroupInvite(null);
    setGroupCall({ group, isVoiceOnly });
  });

  const joinGroupCall = useEffectEvent((group: CallGroup, isVoiceOnly: boolean) => {
    if (groupCall?.group.id === group.id) return;
    // Moving from one group call or voice room to another is fine; a 1:1 call must end first.
    if (active && alreadyInCall()) return;
    setGroupInvite(null);
    setGroupCall({ group, isVoiceOnly });
  });

  const leaveGroupCall = useEffectEvent(() => setGroupCall(null));

  const accept = () => {
    if (!incoming) return;
    if (groupCall) setGroupCall(null);
    setActive({ peer: incoming, isIncoming: true, isVoiceOnly: incoming.isVoiceOnly });
    setIncoming(null);
  };

  const decline = () => {
    if (incoming) send(incoming.id, "call-rejected");
    setIncoming(null);
  };

  const endCall = (reason: CallEndReason) => {
    if (active) {
      send(active.peer.id, "call-ended");
      if (reason === "no-answer") toast({ title: `${active.peer.name} didn't answer` });
      if (reason === "failed") toast({ title: "Call dropped", description: "The connection was lost." });
      if (reason === "no-media") toast({ title: "Can't reach your microphone", description: "Allow microphone access in your browser to make calls.", variant: "destructive" });
    }
    setActive(null);
  };

  const api = useMemo<CallsApi>(
    () => ({
      startCall,
      startGroupCall,
      joinGroupCall,
      leaveGroupCall,
      activeGroupId: groupCall?.group.id ?? null,
      inCall: !!active || !!groupCall,
    }),
    [startCall, startGroupCall, joinGroupCall, leaveGroupCall, groupCall, active]
  );

  return (
    <CallsContext.Provider value={api}>
      {children}
      {userId && (
        <Suspense fallback={null}>
          {active && (
            <VideoCall
              key={active.peer.id}
              currentUserId={userId}
              remoteUserId={active.peer.id}
              remoteUserName={active.peer.name}
              remoteUserAvatar={active.peer.avatar}
              isIncoming={active.isIncoming}
              isVoiceOnly={active.isVoiceOnly}
              onEnd={endCall}
            />
          )}
          {groupCall && (
            <GroupVideoCall
              key={groupCall.group.id}
              groupId={groupCall.group.id}
              groupName={groupCall.group.name}
              currentUserId={userId}
              currentUserName={me.name}
              currentUserAvatar={me.avatar}
              isVoiceOnly={groupCall.isVoiceOnly}
              onEnd={() => setGroupCall(null)}
            />
          )}
          {incoming && (
            <IncomingCallOverlay
              callerName={incoming.name}
              callerAvatar={incoming.avatar}
              isVoiceOnly={incoming.isVoiceOnly}
              onAccept={accept}
              onReject={decline}
            />
          )}
          {groupInvite && !incoming && (
            <GroupCallInvite
              groupName={groupInvite.group.name}
              fromName={groupInvite.fromName}
              fromAvatar={groupInvite.fromAvatar}
              isVoiceOnly={groupInvite.isVoiceOnly}
              onJoin={() => joinGroupCall(groupInvite.group, groupInvite.isVoiceOnly)}
              onDismiss={() => setGroupInvite(null)}
            />
          )}
        </Suspense>
      )}
    </CallsContext.Provider>
  );
};

export default CallProvider;
