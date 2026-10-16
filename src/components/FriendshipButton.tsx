import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { UserPlus, UserCheck, Loader2, X } from "@/components/icons";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useEffectEvent } from "@/hooks/use-effect-event";
import ConfirmDialog from "@/components/ConfirmDialog";
import { explainError } from "@/lib/blocking";

interface FriendshipButtonProps {
  currentUserId: string;
  profileUserId: string;
  className?: string;
  /** Told whether you're friends, so the profile can make Message the main button then. */
  onFriendsChange?: (friends: boolean) => void;
}

const FriendshipButton = ({ currentUserId, profileUserId, className, onFriendsChange }: FriendshipButtonProps) => {
  const [friendshipStatus, setFriendshipStatus] = useState<'none' | 'pending_sent' | 'pending_received' | 'friends' | null>(null);
  const isFriends = friendshipStatus === "friends";
  useEffect(() => { onFriendsChange?.(isFriends); }, [isFriends, onFriendsChange]);
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
        title: "Couldn't send friend request",
        description: await explainError(error, profileUserId),
        variant: "destructive",
      });
      return;
    }

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

    toast({ title: previousStatus === "pending_sent" ? "Request cancelled" : previousStatus === "pending_received" ? "Request declined" : "Friend removed" });
  }, [currentUserId, profileUserId, friendshipStatus, toast]);

  const acceptRequest = async () => {
    setIsLoading(true);
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("user_id", profileUserId)
      .eq("friend_id", currentUserId);
    setIsLoading(false);
    if (error) {
      toast({ title: "Couldn't accept the request", description: error.message, variant: "destructive" });
      return;
    }
    setFriendshipStatus("friends");
  };

  if (friendshipStatus === null) {
    return null;
  }

  // They asked you: answer right here instead of hunting for it on the Friends page.
  if (friendshipStatus === 'pending_received') {
    return (
      <div className={cn("flex gap-2", className)}>
        <Button className="h-full flex-1" onClick={acceptRequest} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserCheck className="h-4 w-4 mr-2" />}
          Accept
        </Button>
        <Button variant="secondary" size="icon" className="h-full w-auto aspect-square" onClick={removeFriend} disabled={isLoading} aria-label="Decline friend request">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (friendshipStatus === 'none') {
    return (
      <Button onClick={sendFriendRequest} disabled={isLoading} className={className}>
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
      <Button variant="secondary" onClick={removeFriend} disabled={isLoading} className={className} aria-label="Cancel friend request">
        <X className="h-4 w-4 mr-2" />
        Cancel request
      </Button>
    );
  }

  if (friendshipStatus === 'friends') {
    return (
      <>
        {/* Shows the relationship, like Facebook's "Friends" button; tapping offers to unfriend. */}
        <Button variant="secondary" onClick={() => setConfirmUnfriend(true)} disabled={isLoading} className={className} aria-label="Friends. Unfriend?">
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <UserCheck className="h-4 w-4 mr-2" />
          )}
          Friends
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
