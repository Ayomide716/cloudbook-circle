import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Heart, ThumbsUp, Laugh, Frown, Angry } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffectEvent } from "@/hooks/use-effect-event";

interface MessageReactionsProps {
  messageId: string;
  currentUserId: string;
  isOwnMessage: boolean;
  /** The picker is opened from the message's action bar (tap or click), so it works on phones too. */
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
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

const MessageReactions = ({ messageId, currentUserId, isOwnMessage, pickerOpen, onPickerOpenChange }: MessageReactionsProps) => {
  const [reactions, setReactions] = useState<Reaction[]>([]);
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
    onPickerOpenChange(false);

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

  const hasReactions = Object.keys(groupedReactions).length > 0;
  if (!hasReactions && !pickerOpen) return null;

  return (
    <div className={cn("relative flex", isOwnMessage ? "justify-end" : "justify-start")}>
      {pickerOpen && (
        <div
          role="menu"
          aria-label="React to message"
          className={cn(
            "absolute bottom-full mb-1 bg-card border border-border rounded-full shadow-lg p-1 flex gap-0.5 z-50 animate-in fade-in-0 zoom-in-95",
            isOwnMessage ? "right-0" : "left-0"
          )}
        >
          {REACTION_TYPES.map((reaction) => {
            const Icon = reaction.icon;
            return (
              <button
                key={reaction.type}
                role="menuitem"
                onClick={() => handleReaction(reaction.type)}
                className={cn(
                  "p-2 rounded-full transition-transform hover:scale-125 hover:bg-accent",
                  userReaction === reaction.type && "bg-accent scale-110"
                )}
                aria-label={reaction.label}
                title={reaction.label}
              >
                <Icon className={cn("h-5 w-5", reaction.color)} />
              </button>
            );
          })}
        </div>
      )}

      {/* Existing reactions; tapping toggles your own */}
      {hasReactions && (
        <button
          onClick={() => onPickerOpenChange(!pickerOpen)}
          className="-mt-1.5 flex items-center gap-0.5 bg-card border border-border rounded-full px-1.5 py-0.5 shadow-sm"
          aria-label="Reactions"
        >
          {Object.entries(groupedReactions).map(([type, count]) => (
            <span key={type} className="flex items-center gap-0.5">
              {getReactionIcon(type)}
              {count > 1 && <span className="text-xs text-muted-foreground">{count}</span>}
            </span>
          ))}
        </button>
      )}
    </div>
  );
};

export default MessageReactions;
