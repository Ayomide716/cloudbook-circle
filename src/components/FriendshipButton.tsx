import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus, UserCheck, UserMinus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FriendshipButtonProps {
  currentUserId: string;
  profileUserId: string;
}

const FriendshipButton = ({ currentUserId, profileUserId }: FriendshipButtonProps) => {
  const [friendshipStatus, setFriendshipStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'friends' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    checkFriendshipStatus();
  }, [currentUserId, profileUserId]);

  const checkFriendshipStatus = async () => {
    const { data } = await supabase
      .from("friendships")
      .select("*")
      .or(`and(user_id.eq.${currentUserId},friend_id.eq.${profileUserId}),and(user_id.eq.${profileUserId},friend_id.eq.${currentUserId})`)
      .maybeSingle();

    if (!data) {
      setFriendshipStatus('none');
      return;
    }

    if (data.status === 'accepted') {
      setFriendshipStatus('friends');
    } else if (data.user_id === currentUserId) {
      setFriendshipStatus('pending_sent');
    } else {
      setFriendshipStatus('pending_received');
    }
  };

  const sendFriendRequest = async () => {
    setIsLoading(true);

    const { error } = await supabase
      .from("friendships")
      .insert({
        user_id: currentUserId,
        friend_id: profileUserId,
        status: 'pending',
      });

    setIsLoading(false);

    if (error) {
      toast({
        title: "Error sending friend request",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Friend request sent",
    });
    checkFriendshipStatus();
  };

  const removeFriend = async () => {
    setIsLoading(true);

    const { error } = await supabase
      .from("friendships")
      .delete()
      .or(`and(user_id.eq.${currentUserId},friend_id.eq.${profileUserId}),and(user_id.eq.${profileUserId},friend_id.eq.${currentUserId})`);

    setIsLoading(false);

    if (error) {
      toast({
        title: "Error removing friend",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Friend removed",
    });
    checkFriendshipStatus();
  };

  if (friendshipStatus === null) {
    return null;
  }

  if (friendshipStatus === 'none') {
    return (
      <Button onClick={sendFriendRequest} disabled={isLoading}>
        {isLoading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <UserPlus className="h-4 w-4 mr-2" />
        )}
        Add Friend
      </Button>
    );
  }

  if (friendshipStatus === 'pending_sent') {
    return (
      <Button variant="secondary" disabled>
        <UserCheck className="h-4 w-4 mr-2" />
        Request Sent
      </Button>
    );
  }

  if (friendshipStatus === 'friends') {
    return (
      <Button variant="secondary" onClick={removeFriend} disabled={isLoading}>
        {isLoading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <UserMinus className="h-4 w-4 mr-2" />
        )}
        Unfriend
      </Button>
    );
  }

  return null;
};

export default FriendshipButton;