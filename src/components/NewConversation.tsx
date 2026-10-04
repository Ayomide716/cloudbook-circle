import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { MessageSquarePlus, Loader2 } from "lucide-react";
import { useEffectEvent } from "@/hooks/use-effect-event";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface NewConversationProps {
  currentUserId: string;
  onSelectUser: (user: Profile) => void;
}

const NewConversation = ({ currentUserId, onSelectUser }: NewConversationProps) => {
  const [friends, setFriends] = useState<Profile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const loadFriends = useEffectEvent(async () => {
    setIsLoading(true);

    // Get accepted friendships
    const { data: friendships } = await supabase
      .from("friendships")
      .select("user_id, friend_id")
      .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
      .eq("status", "accepted");

    if (!friendships) {
      setIsLoading(false);
      return;
    }

    // Get friend IDs
    const friendIds = friendships.map(f => 
      f.user_id === currentUserId ? f.friend_id : f.user_id
    );

    if (friendIds.length === 0) {
      setFriends([]);
      setIsLoading(false);
      return;
    }

    // Get friend profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", friendIds);

    setFriends(profiles || []);
    setIsLoading(false);
  });

  useEffect(() => {
    if (open) {
      loadFriends();
    }
  }, [open, currentUserId, loadFriends]);

  const filteredFriends = friends.filter(friend =>
    friend.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectUser = (user: Profile) => {
    onSelectUser(user);
    setOpen(false);
    setSearchQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full">
          <MessageSquarePlus className="h-4 w-4 mr-2" />
          New Message
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <Input
            placeholder="Search friends..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          
          <ScrollArea className="h-64">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredFriends.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {friends.length === 0 
                  ? "No friends yet. Add friends to start chatting!"
                  : "No friends found"
                }
              </p>
            ) : (
              <div className="space-y-2">
                {filteredFriends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => handleSelectUser(friend)}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={friend.avatar_url || undefined} />
                      <AvatarFallback>
                        {friend.full_name?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold">
                        {friend.full_name || "Anonymous"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NewConversation;