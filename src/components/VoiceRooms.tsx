import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Mic, MicOff, PhoneOff, Plus, Radio, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { useCalls } from "@/hooks/use-calls";
import { useGroupCallParticipants } from "@/hooks/use-group-call-participants";
import { broadcast } from "@/lib/realtime-broadcast";
import { roomCallId } from "@/lib/voice-rooms";

interface VoiceRoom {
  id: string;
  title: string;
  created_by: string;
}

interface VoiceRoomsProps {
  groupId: string;
  currentUserId: string;
}


interface VoiceRoomCardProps {
  room: VoiceRoom;
  isInRoom: boolean;
  isCreator: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onEnd: () => void;
}

const VoiceRoomCard = ({ room, isInRoom, isCreator, onJoin, onLeave, onEnd }: VoiceRoomCardProps) => {
  // Live list from the room's presence: people who close the tab drop off by themselves.
  // While you're in the room the call window owns the connection, so the card doesn't watch it.
  const participants = useGroupCallParticipants(roomCallId(room.id), !isInRoom);

  return (
    <Card className={cn("p-4 rounded-2xl transition-all", isInRoom && "ring-2 ring-primary/50 bg-primary/5")}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "w-2.5 h-2.5 rounded-full shrink-0",
              isInRoom || participants.length > 0 ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"
            )}
          />
          <span className="font-semibold text-sm truncate">{room.title}</span>
        </div>
        {!isInRoom && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <Users className="h-3.5 w-3.5" />
            {participants.length}
          </span>
        )}
      </div>

      {isInRoom ? (
        <p className="text-sm text-muted-foreground mb-3">
          You're in this room. Mute, see who's talking or leave from the call window, which stays open while you browse.
        </p>
      ) : participants.length > 0 ? (
        <div className="flex flex-wrap gap-3 mb-3">
          {participants.map((p) => (
            <div key={p.userId} className="flex flex-col items-center gap-1">
              <div className="relative">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={p.avatar || undefined} alt="" />
                  <AvatarFallback className="text-xs">{p.name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 rounded-full p-0.5 ring-2 ring-card",
                    p.audio ? "bg-green-500" : "bg-destructive"
                  )}
                  aria-label={p.audio ? "Mic on" : "Muted"}
                >
                  {p.audio ? <Mic className="h-2.5 w-2.5 text-white" /> : <MicOff className="h-2.5 w-2.5 text-destructive-foreground" />}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground max-w-[64px] truncate">{p.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground mb-3">Nobody's here yet. Join and others will hear you.</p>
      )}

      <div className="flex gap-2">
        {isInRoom ? (
          <Button size="sm" variant="destructive" className="rounded-xl flex-1" onClick={onLeave}>
            <PhoneOff className="h-4 w-4 mr-1" /> Leave room
          </Button>
        ) : (
          <Button size="sm" className="rounded-xl flex-1 gradient-brand text-primary-foreground" onClick={onJoin}>
            <Mic className="h-4 w-4 mr-1" /> Join room
          </Button>
        )}
        {isCreator && (
          <Button size="sm" variant="ghost" className="rounded-xl text-destructive" onClick={onEnd}>
            End room
          </Button>
        )}
      </div>
    </Card>
  );
};

const VoiceRooms = ({ groupId, currentUserId }: VoiceRoomsProps) => {
  const [rooms, setRooms] = useState<VoiceRoom[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const { toast } = useToast();
  const { joinGroupCall, leaveGroupCall, activeGroupId } = useCalls();

  const loadRooms = useEffectEvent(async () => {
    const { data } = await supabase
      .from("voice_rooms")
      .select("id, title, created_by")
      .eq("group_id", groupId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    if (data) setRooms(data);
  });

  useEffect(() => {
    loadRooms();
    const channel = supabase
      .channel(`voice-rooms-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_rooms", filter: `group_id=eq.${groupId}` }, () => loadRooms())
      // Ended rooms are hidden from other members, so the database can't tell them: the creator does.
      .on("broadcast", { event: "room-ended" }, ({ payload }) => {
        setRooms((prev) => prev.filter((r) => r.id !== payload.roomId));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, loadRooms]);

  const createRoom = async () => {
    const title = newTitle.trim();
    if (!title) return;
    const { data, error } = await supabase
      .from("voice_rooms")
      .insert({ group_id: groupId, title, created_by: currentUserId })
      .select("id, title, created_by")
      .single();
    if (error || !data) {
      toast({ title: "Couldn't create the room", variant: "destructive" });
      return;
    }
    setNewTitle("");
    setShowCreate(false);
    setRooms((prev) => (prev.some((r) => r.id === data.id) ? prev : [data, ...prev]));
    joinGroupCall({ id: roomCallId(data.id), name: data.title }, true);
  };

  const endRoom = async (room: VoiceRoom) => {
    const { error } = await supabase.from("voice_rooms").update({ is_active: false }).eq("id", room.id);
    if (error) {
      toast({ title: "Couldn't end the room", variant: "destructive" });
      return;
    }
    broadcast([
      { topic: `group-call-${roomCallId(room.id)}`, event: "room-ended", payload: { roomId: room.id } },
      { topic: `voice-rooms-${groupId}`, event: "room-ended", payload: { roomId: room.id } },
    ]);
    if (activeGroupId === roomCallId(room.id)) leaveGroupCall();
    setRooms((prev) => prev.filter((r) => r.id !== room.id));
    toast({ title: "Voice room ended" });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          Voice rooms
        </h3>
        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> New room
        </Button>
      </div>

      {rooms.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No voice rooms yet. Start one for a drop-in chat anyone in the group can join.
        </p>
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => (
            <VoiceRoomCard
              key={room.id}
              room={room}
              isInRoom={activeGroupId === roomCallId(room.id)}
              isCreator={room.created_by === currentUserId}
              onJoin={() => joinGroupCall({ id: roomCallId(room.id), name: room.title }, true)}
              onLeave={leaveGroupCall}
              onEnd={() => endRoom(room)}
            />
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create a voice room</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Room name (e.g. Friday hangout)"
              aria-label="Room name"
              value={newTitle}
              maxLength={60}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createRoom()}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={createRoom} disabled={!newTitle.trim()} className="gradient-brand text-primary-foreground">
                Create and join
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VoiceRooms;
