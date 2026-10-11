import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCalls } from "@/hooks/use-calls";
import { useGroupCallParticipants } from "@/hooks/use-group-call-participants";
import { roomCallId } from "@/lib/voice-rooms";

interface LiveRoom {
  id: string;
  title: string;
  groupName: string;
}

/** Most rooms watched at once; each one is a Realtime presence subscription. */
const MAX_ROOMS = 6;

const LiveRoomCard = ({ room }: { room: LiveRoom }) => {
  const { joinGroupCall, activeGroupId } = useCalls();
  const callId = roomCallId(room.id);
  const inRoom = activeGroupId === callId;
  const people = useGroupCallParticipants(callId, !inRoom);

  // Only rooms where someone is talking right now belong in the stories row.
  if (inRoom || people.length === 0) return null;

  return (
    <button
      type="button"
      className="flex w-[68px] flex-shrink-0 flex-col items-center gap-1"
      onClick={() => joinGroupCall({ id: callId, name: room.title }, true)}
      aria-label={`Join live voice room ${room.title} in ${room.groupName}, ${people.length} listening`}
    >
      {/* A live room as a story bubble: sound bars in a tangerine circle, with a LIVE tag. */}
      <span className="relative block h-[66px] w-[66px] rounded-full bg-gradient-to-tr from-amber-400 via-primary to-rose-500 p-[2.5px]">
        <span className="flex h-full w-full items-end justify-center gap-[3px] rounded-full border-[2.5px] border-background bg-primary pb-4" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="w-1 rounded-full bg-primary-foreground animate-sound-bar motion-reduce:animate-none" style={{ height: 14, animationDelay: `${i * 0.15}s` }} />
          ))}
        </span>
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-md border-2 border-background bg-rose-500 px-1.5 text-[9px] font-extrabold tracking-wider text-white">LIVE</span>
      </span>
      <span className="w-full truncate text-center text-[11.5px] font-medium text-foreground/90">{room.groupName}</span>
    </button>
  );
};

/** Live voice rooms in your groups, shown as cards in the stories row. */
const LiveRoomStories = ({ currentUserId }: { currentUserId: string }) => {
  const [rooms, setRooms] = useState<LiveRoom[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: memberships } = await supabase.from("group_members").select("group_id").eq("user_id", currentUserId);
      const groupIds = (memberships ?? []).map((m) => m.group_id);
      if (groupIds.length === 0) {
        if (!cancelled) setRooms([]);
        return;
      }
      const { data } = await supabase
        .from("voice_rooms")
        .select("id, title, groups:group_id (name)")
        .eq("is_active", true)
        .in("group_id", groupIds)
        .order("created_at", { ascending: false })
        .limit(MAX_ROOMS);
      if (cancelled) return;
      setRooms(
        (data ?? []).map((r) => ({
          id: r.id,
          title: r.title,
          groupName: (r.groups as { name: string } | null)?.name ?? r.title,
        }))
      );
    };
    load();

    // Rooms opening or closing anywhere: reload the short list.
    const channel = supabase
      .channel(`live-room-stories-${currentUserId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_rooms" }, () => load())
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  return (
    <>
      {rooms.map((room) => (
        <LiveRoomCard key={room.id} room={room} />
      ))}
    </>
  );
};

export default LiveRoomStories;
