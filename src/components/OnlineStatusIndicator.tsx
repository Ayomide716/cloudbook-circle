import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface OnlineStatusIndicatorProps {
  userId: string;
  showText?: boolean;
  currentUserId?: string;
}

const OnlineStatusIndicator = ({ userId, showText = false, currentUserId }: OnlineStatusIndicatorProps) => {
  const [status, setStatus] = useState<{
    is_online: boolean;
    last_seen: string;
  } | null>(null);
  const [isFriend, setIsFriend] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkFriendshipAndLoadStatus();
    const cleanup = setupRealtimeSubscription();
    return cleanup;
  }, [userId, currentUserId]);

  const checkFriendshipAndLoadStatus = async () => {
    if (!currentUserId) {
      setIsLoading(false);
      return;
    }

    // If viewing own profile, always show status
    if (currentUserId === userId) {
      setIsFriend(true);
      await loadStatus();
      setIsLoading(false);
      return;
    }

    // Check if users are friends (accepted friendship)
    const { data: friendship } = await supabase
      .from("friendships")
      .select("id, status")
      .or(`and(user_id.eq.${currentUserId},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${currentUserId})`)
      .eq("status", "accepted")
      .maybeSingle();

    if (friendship) {
      setIsFriend(true);
      await loadStatus();
    }
    
    setIsLoading(false);
  };

  const loadStatus = async () => {
    const { data } = await supabase
      .from("user_status" as any)
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (data) {
      setStatus(data as any);
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel(`user-status-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_status",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          if (isFriend) {
            loadStatus();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  // Don't show anything if not friends or still loading
  if (isLoading || !isFriend || !status) return null;

  const isOnline = status.is_online && 
    new Date(status.last_seen).getTime() > Date.now() - 5 * 60 * 1000; // 5 minutes

  if (showText) {
    return (
      <span className="text-sm text-muted-foreground">
        {isOnline ? (
          <span className="text-green-500">● Online</span>
        ) : (
          `Last seen ${formatDistanceToNow(new Date(status.last_seen), { addSuffix: true })}`
        )}
      </span>
    );
  }

  return (
    <span
      className={`inline-block h-3 w-3 rounded-full ${
        isOnline ? "bg-green-500" : "bg-gray-400"
      }`}
    />
  );
};

export default OnlineStatusIndicator;