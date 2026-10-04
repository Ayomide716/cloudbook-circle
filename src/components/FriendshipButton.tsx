import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus, UserCheck, UserMinus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffectEvent } from "@/hooks/use-effect-event";
import ConfirmDialog from "@/components/ConfirmDialog";

interface FriendshipButtonProps {
  currentUserId: string;
  profileUserId: string;
}

const FriendshipButton = ({ currentUserId, profileUserId }: FriendshipButtonProps) => {
  const [friendshipStatus, setFriendshipStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'friends' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmUnfriend, setConfirmUnfriend] = useState(false);
  const { toast } = useToast();

  const checkFriendshipStatus = useEffectEvent(async () => {
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
  });

  useEffect(() => {
    checkFriendshipStatus();
  }, [currentUserId, profileUserId, checkFriendshipStatus]);

  const sendFriendRequest = useCallback(async () => {
    // Optimistic update
    const previousStatus = friendshipStatus;
    setFriendshipStatus('pending_sent');
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
      // Revert on failure
      setFriendshipStatus(previousStatus);
      toast({
        title: "Error sending friend request",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Friend request sent" });
  }, [currentUserId, profileUserId, friendshipStatus, toast]);

  const removeFriend = useCallback(async () => {
    // Optimistic update
    const previousStatus = friendshipStatus;
    setFriendshipStatus('none');
    setIsLoading(true);

    const { error } = await supabase
      .from("friendships")
      .delete()
      .or(`and(user_id.eq.${currentUserId},friend_id.eq.${profileUserId}),and(user_id.eq.${profileUserId},friend_id.eq.${currentUserId})`);

    setIsLoading(false);

    if (error) {
      setFriendshipStatus(previousStatus);
      toast({
        title: "Error removing friend",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Friend removed" });
  }, [currentUserId, profileUserId, friendshipStatus, toast]);

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
      <>
        <Button variant="secondary" onClick={() => setConfirmUnfriend(true)} disabled={isLoading}>
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <UserMinus className="h-4 w-4 mr-2" />
          )}
          Unfriend
        </Button>
        <ConfirmDialog
          open={confirmUnfriend}
          onOpenChange={setConfirmUnfriend}
          title="Remove this friend?"
          description="You'll need to send a new friend request to be friends again."
          confirmLabel="Unfriend"
          onConfirm={removeFriend}
        />
      </>
    );
  }

  return null;
};

export default FriendshipButton;
