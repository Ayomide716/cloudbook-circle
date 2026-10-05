import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
      className="flex-shrink-0 group"
      onClick={() => joinGroupCall({ id: callId, name: room.title }, true)}
      aria-label={`Join live voice room ${room.title} in ${room.groupName}, ${people.length} listening`}
    >
      <div className="relative w-[104px] h-[172px] rounded-2xl overflow-hidden bg-primary text-primary-foreground p-2.5 flex flex-col justify-between text-left shadow-sm transition-transform duration-200 group-hover:scale-[1.03]">
        <span className="self-start whitespace-nowrap rounded-md bg-gold px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider text-foreground">
          LIVE ROOM
        </span>
        <div className="flex h-7 items-end gap-[3px]" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-primary-foreground animate-sound-bar motion-reduce:animate-none"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        <div className="min-w-0">
          <div className="flex -space-x-1.5 mb-1">
            {people.slice(0, 3).map((p) => (
              <Avatar key={p.userId} className="h-5 w-5 ring-2 ring-primary">
                <AvatarImage src={p.avatar || undefined} alt="" />
                <AvatarFallback className="text-[8px] text-foreground">{p.name?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
            ))}
          </div>
          <p className="text-xs font-bold leading-tight line-clamp-2">{room.groupName}</p>
          <p className="text-[10px] opacity-90">{people.length} listening</p>
        </div>
      </div>
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
