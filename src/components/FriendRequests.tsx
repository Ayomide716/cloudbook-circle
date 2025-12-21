import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

interface FriendRequest {
  id: string;
  user_id: string;
  friend_id: string;
  status: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface FriendRequestsProps {
  userId: string;
}

const FriendRequests = ({ userId }: FriendRequestsProps) => {
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    loadRequests();
    setupRealtimeSubscription();
  }, [userId]);

  const loadRequests = async () => {
    const { data, error } = await supabase
      .from("friendships")
      .select(`
        *,
        profiles!friendships_user_id_fkey (
          id,
          full_name,
          avatar_url
        )
      `)
      .eq("friend_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error loading friend requests",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setRequests(data || []);
    setPendingCount(data?.length || 0);
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel("friendships-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
        },
        () => {
          loadRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleAccept = async (requestId: string) => {
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", requestId);

    if (error) {
      toast({
        title: "Error accepting request",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Friend request accepted",
    });
    loadRequests();
  };

  const handleDecline = async (requestId: string) => {
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", requestId);

    if (error) {
      toast({
        title: "Error declining request",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Friend request declined",
    });
    loadRequests();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-full bg-secondary hover:bg-secondary/80 relative"
        >
          <Users className="h-5 w-5" />
          {pendingCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-xs rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <h3 className="font-semibold mb-2">Friend Requests</h3>
        <ScrollArea className="h-96">
          {requests.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No pending friend requests
            </p>
          ) : (
            <div className="space-y-3">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent"
                >
                  <Link to={`/profile/${request.user_id}`}>
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={request.profiles.avatar_url || undefined} />
                      <AvatarFallback>
                        {request.profiles.full_name?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="flex-1">
                    <Link to={`/profile/${request.user_id}`}>
                      <p className="font-semibold text-sm hover:underline">
                        {request.profiles.full_name || "Anonymous"}
                      </p>
                    </Link>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={() => handleAccept(request.id)}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDecline(request.id)}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default FriendRequests;