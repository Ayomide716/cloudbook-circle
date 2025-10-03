import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";

interface OnlineStatusIndicatorProps {
  userId: string;
  showText?: boolean;
}

const OnlineStatusIndicator = ({ userId, showText = false }: OnlineStatusIndicatorProps) => {
  const [status, setStatus] = useState<{
    is_online: boolean;
    last_seen: string;
  } | null>(null);

  useEffect(() => {
    loadStatus();
    setupRealtimeSubscription();
  }, [userId]);

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
          loadStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  if (!status) return null;

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