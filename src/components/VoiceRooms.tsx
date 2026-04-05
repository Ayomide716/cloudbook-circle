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

interface VoiceRoom {
  id: string;
  title: string;
  created_by: string;
  is_active: boolean;
  created_at: string;
  participants: Participant[];
}

interface Participant {
  id: string;
  user_id: string;
  is_muted: boolean;
  is_speaker: boolean;
  profile?: { full_name: string | null; avatar_url: string | null } | null;
}

interface VoiceRoomsProps {
  groupId: string;
  currentUserId: string;
}

const VoiceRooms = ({ groupId, currentUserId }: VoiceRoomsProps) => {
  const [rooms, setRooms] = useState<VoiceRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    loadRooms();

    const channel = supabase
      .channel(`voice-rooms-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_rooms", filter: `group_id=eq.${groupId}` }, () => loadRooms())
      .on("postgres_changes", { event: "*", schema: "public", table: "voice_room_participants" }, () => loadRooms())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [groupId]);

  const loadRooms = async () => {
    const { data: roomsData } = await supabase
      .from("voice_rooms")
      .select("*")
      .eq("group_id", groupId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (!roomsData) return;

    const roomIds = roomsData.map(r => r.id);
    if (roomIds.length === 0) { setRooms([]); return; }

    const { data: participants } = await supabase
      .from("voice_room_participants")
      .select("*")
      .in("room_id", roomIds);

    const userIds = [...new Set(participants?.map(p => p.user_id) || [])];
    const { data: profiles } = userIds.length > 0
      ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds)
      : { data: [] };

    const profileMap = new Map(profiles?.map(p => [p.id, p]));

    const enriched: VoiceRoom[] = roomsData.map(room => ({
      ...room,
      participants: (participants || [])
        .filter(p => p.room_id === room.id)
        .map(p => ({ ...p, profile: profileMap.get(p.user_id) || undefined })),
    }));

    setRooms(enriched);
  };

  const createRoom = async () => {
    if (!newTitle.trim()) return;
    const { error } = await supabase.from("voice_rooms").insert({
      group_id: groupId,
      title: newTitle.trim(),
      created_by: currentUserId,
    } as any);

    if (error) {
      toast({ title: "Error creating room", variant: "destructive" });
      return;
    }
    setNewTitle("");
    setShowCreate(false);
    toast({ title: "Voice room created! 🎙️" });
  };

  const joinRoom = async (roomId: string) => {
    if (activeRoomId) await leaveRoom();

    const { error } = await supabase.from("voice_room_participants").insert({
      room_id: roomId,
      user_id: currentUserId,
      is_speaker: true,
    } as any);

    if (error && !error.message.includes("duplicate")) {
      toast({ title: "Error joining room", variant: "destructive" });
      return;
    }
    setActiveRoomId(roomId);
    setIsMuted(false);
    toast({ title: "Joined voice room 🎤" });
  };

  const leaveRoom = async () => {
    if (!activeRoomId) return;
    await supabase.from("voice_room_participants")
      .delete()
      .eq("room_id", activeRoomId)
      .eq("user_id", currentUserId);
    setActiveRoomId(null);
    toast({ title: "Left voice room" });
  };

  const toggleMute = async () => {
    if (!activeRoomId) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    await supabase.from("voice_room_participants")
      .update({ is_muted: newMuted })
      .eq("room_id", activeRoomId)
      .eq("user_id", currentUserId);
  };

  const endRoom = async (roomId: string) => {
    await supabase.from("voice_rooms").update({ is_active: false }).eq("id", roomId);
    if (activeRoomId === roomId) setActiveRoomId(null);
    toast({ title: "Voice room ended" });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          Voice Rooms
        </h3>
        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Room
        </Button>
      </div>

      {rooms.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No active voice rooms. Start one!</p>
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => {
            const isInRoom = activeRoomId === room.id;
            const isCreator = room.created_by === currentUserId;

            return (
              <Card key={room.id} className={cn(
                "p-4 rounded-2xl transition-all",
                isInRoom && "ring-2 ring-primary/50 bg-primary/5"
              )}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2.5 h-2.5 rounded-full", isInRoom ? "bg-green-500 animate-pulse" : "bg-primary/60")} />
                    <span className="font-semibold text-sm">{room.title}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {room.participants.length}
                  </div>
                </div>

                {/* Participants */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {room.participants.map((p) => (
                    <div key={p.id} className="flex flex-col items-center gap-1">
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={p.profile?.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">{p.profile?.full_name?.[0] || "U"}</AvatarFallback>
                        </Avatar>
                        {p.is_muted && (
                          <div className="absolute -bottom-0.5 -right-0.5 bg-destructive rounded-full p-0.5">
                            <MicOff className="h-2.5 w-2.5 text-destructive-foreground" />
                          </div>
                        )}
                        {!p.is_muted && p.is_speaker && (
                          <div className="absolute -bottom-0.5 -right-0.5 bg-green-500 rounded-full p-0.5">
                            <Mic className="h-2.5 w-2.5 text-white" />
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground max-w-[60px] truncate">
                        {p.user_id === currentUserId ? "You" : p.profile?.full_name || "User"}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {isInRoom ? (
                    <>
                      <Button
                        size="sm"
                        variant={isMuted ? "destructive" : "outline"}
                        className="rounded-xl flex-1"
                        onClick={toggleMute}
                      >
                        {isMuted ? <MicOff className="h-4 w-4 mr-1" /> : <Mic className="h-4 w-4 mr-1" />}
                        {isMuted ? "Unmute" : "Mute"}
                      </Button>
                      <Button size="sm" variant="destructive" className="rounded-xl" onClick={leaveRoom}>
                        <PhoneOff className="h-4 w-4 mr-1" /> Leave
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" className="rounded-xl flex-1 gradient-brand text-primary-foreground" onClick={() => joinRoom(room.id)}>
                      <Mic className="h-4 w-4 mr-1" /> Join Room
                    </Button>
                  )}
                  {isCreator && (
                    <Button size="sm" variant="ghost" className="rounded-xl text-destructive" onClick={() => endRoom(room.id)}>
                      End
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Voice Room</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Room title (e.g. Chill Vibes 🎵)"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createRoom()}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={createRoom} disabled={!newTitle.trim()} className="gradient-brand text-primary-foreground">
                Create Room
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VoiceRooms;
