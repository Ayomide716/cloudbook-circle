import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Heart, ThumbsUp, Laugh, Frown, Angry } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffectEvent } from "@/hooks/use-effect-event";

interface MessageReactionsProps {
  messageId: string;
  currentUserId: string;
  isOwnMessage: boolean;
}

interface Reaction {
  id: string;
  reaction_type: string;
  user_id: string;
}

const REACTION_TYPES = [
  { type: "like", icon: ThumbsUp, label: "Like", color: "text-primary" },
  { type: "heart", icon: Heart, label: "Love", color: "text-red-500" },
  { type: "laugh", icon: Laugh, label: "Haha", color: "text-yellow-500" },
  { type: "wow", icon: () => <span className="text-base">😮</span>, label: "Wow", color: "" },
  { type: "sad", icon: Frown, label: "Sad", color: "text-yellow-600" },
  { type: "angry", icon: Angry, label: "Angry", color: "text-orange-500" },
];

const MessageReactions = ({ messageId, currentUserId, isOwnMessage }: MessageReactionsProps) => {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [userReaction, setUserReaction] = useState<string | null>(null);

  const loadReactions = useEffectEvent(async () => {
    const { data } = await supabase
      .from("message_reactions")
      .select("*")
      .eq("message_id", messageId);

    if (data) {
      setReactions(data);
      const myReaction = data.find((r) => r.user_id === currentUserId);
      setUserReaction(myReaction?.reaction_type || null);
    }
  });

  const setupRealtimeSubscription = useEffectEvent(() => {
    const channel = supabase
      .channel(`message-reactions-${messageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
          filter: `message_id=eq.${messageId}`,
        },
        () => loadReactions()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  });

  useEffect(() => {
    loadReactions();
    return setupRealtimeSubscription();
  }, [messageId, loadReactions, setupRealtimeSubscription]);

  const handleReaction = async (reactionType: string) => {
    setShowPicker(false);

    if (userReaction === reactionType) {
      // Remove reaction
      await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", currentUserId);
      setUserReaction(null);
    } else {
      // Add/update reaction
      if (userReaction) {
        await supabase
          .from("message_reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", currentUserId);
      }
      await supabase.from("message_reactions").insert({
        message_id: messageId,
        user_id: currentUserId,
        reaction_type: reactionType,
      });
      setUserReaction(reactionType);
    }
  };

  const groupedReactions = reactions.reduce((acc, r) => {
    acc[r.reaction_type] = (acc[r.reaction_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const getReactionIcon = (type: string) => {
    const reaction = REACTION_TYPES.find((r) => r.type === type);
    if (!reaction) return null;
    const Icon = reaction.icon;
    return <Icon className={cn("h-3 w-3", reaction.color)} />;
  };

  return (
    <div className={cn("relative flex items-center gap-1", isOwnMessage ? "flex-row-reverse" : "flex-row")}>
      {/* Reaction picker trigger */}
      <div
        className="opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        onMouseEnter={() => setShowPicker(true)}
        onMouseLeave={() => setShowPicker(false)}
      >
        <span className="text-muted-foreground hover:text-foreground text-xs">😊</span>
        
        {/* Reaction picker */}
        {showPicker && (
          <div
            className={cn(
              "absolute bottom-full mb-1 bg-card border border-border rounded-full shadow-lg p-1.5 flex gap-1 z-50",
              isOwnMessage ? "right-0" : "left-0"
            )}
          >
            {REACTION_TYPES.map((reaction) => {
              const Icon = reaction.icon;
              return (
                <button
                  key={reaction.type}
                  onClick={() => handleReaction(reaction.type)}
                  className={cn(
                    "p-1.5 rounded-full transition-all hover:scale-125 hover:bg-accent",
                    userReaction === reaction.type && "bg-accent scale-110"
                  )}
                  title={reaction.label}
                >
                  <Icon className={cn("h-5 w-5", reaction.color)} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Display existing reactions */}
      {Object.keys(groupedReactions).length > 0 && (
        <div className="flex items-center gap-0.5 bg-card border border-border rounded-full px-1.5 py-0.5 shadow-sm">
          {Object.entries(groupedReactions).map(([type, count]) => (
            <div key={type} className="flex items-center gap-0.5">
              {getReactionIcon(type)}
              {count > 1 && <span className="text-xs text-muted-foreground">{count}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MessageReactions;
