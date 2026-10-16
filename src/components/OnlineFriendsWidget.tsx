import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import { Circle } from "@/components/icons";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { dbChannel } from "@/lib/realtime";

interface OnlineFriend {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface OnlineFriendsWidgetProps {
  currentUserId: string;
}

const OnlineFriendsWidget = ({ currentUserId }: OnlineFriendsWidgetProps) => {
  const navigate = useNavigate();
  const [onlineFriends, setOnlineFriends] = useState<OnlineFriend[]>([]);

  const loadOnlineFriends = useEffectEvent(async () => {
    const { data: friendships } = await supabase
      .from("friendships")
      .select("user_id, friend_id")
      .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
      .eq("status", "accepted");

    if (!friendships?.length) return;

    const friendIds = friendships.map((f) =>
      f.user_id === currentUserId ? f.friend_id : f.user_id
    );

    const { data: statuses } = await supabase
      .from("user_status")
      .select("user_id")
      .in("user_id", friendIds)
      .eq("is_online", true);

    if (!statuses?.length) {
      setOnlineFriends([]);
      return;
    }

    const onlineIds = statuses.map((s) => s.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", onlineIds);

    setOnlineFriends(profiles || []);
  });

  useEffect(() => {
    loadOnlineFriends();
    const interval = setInterval(loadOnlineFriends, 30000);

    const channel = dbChannel("online-friends-widget")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_status" }, () => loadOnlineFriends())
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [currentUserId, loadOnlineFriends]);

  if (onlineFriends.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Circle className="h-2.5 w-2.5 fill-green-500 text-green-500" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Online ({onlineFriends.length})
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {onlineFriends.slice(0, 8).map((friend) => (
          <motion.button
            key={friend.id}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate(`/messages?user=${friend.id}`)}
            className="relative group"
            title={friend.full_name || "User"}
          >
            <Avatar className="h-9 w-9 ring-2 ring-green-500/40 group-hover:ring-green-500/70 transition-all">
              <AvatarImage src={friend.avatar_url || undefined} />
              <AvatarFallback className="text-xs bg-secondary">
                {friend.full_name?.[0]?.toUpperCase() || "?"}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default OnlineFriendsWidget;
