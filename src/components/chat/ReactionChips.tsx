import { useState } from "react";
import { ActionMenu, ActionMenuContent, ActionMenuItem, ActionMenuTrigger } from "@/components/ui/action-menu";
import { reactionEmoji, type ChatReaction } from "@/lib/chat-reactions";
import { cn } from "@/lib/utils";
import ReactionEmoji from "@/components/reactions/ReactionEmoji";
import { hasReactionEmoji } from "@/lib/reaction-emoji";

interface ReactionChipsProps {
  reactions: ChatReaction[];
  currentUserId: string;
  /** A person's name for the "who reacted" list. */
  nameOf: (userId: string) => string;
  /** Takes your reaction off (tapping it in the list, as on WhatsApp). */
  onRemoveMine: () => void;
  isOwnMessage: boolean;
}

/**
 * The reactions under a message, as on WhatsApp: the emoji used and how many, in one little
 * pill tucked under the bubble. Tap it to see who reacted; tap your own there to take it off.
 */
const ReactionChips = ({ reactions, currentUserId, nameOf, onRemoveMine, isOwnMessage }: ReactionChipsProps) => {
  const [open, setOpen] = useState(false);
  if (reactions.length === 0) return null;
  const kinds = [...new Set(reactions.map((r) => r.reaction_type))];
  // You first, then everyone else.
  const people = [...reactions].sort((a, b) => Number(b.user_id === currentUserId) - Number(a.user_id === currentUserId));

  return (
    <div className={cn("relative z-[1] -mt-1.5 flex px-2", isOwnMessage ? "justify-end" : "justify-start")}>
      <ActionMenu open={open} onOpenChange={setOpen}>
        <ActionMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-0.5 rounded-full border border-border bg-card px-1.5 py-0.5 text-[13px] leading-none shadow-sm dark:bg-[#232327]"
            aria-label={`Reactions: ${reactions.length}. See who reacted`}
          >
            {kinds.slice(0, 3).map((k) => (hasReactionEmoji(k) ? <ReactionEmoji key={k} type={k} className="h-4 w-4" /> : <span key={k}>{reactionEmoji(k)}</span>))}
            {reactions.length > 1 && <span className="ml-0.5 text-xs text-muted-foreground">{reactions.length}</span>}
          </button>
        </ActionMenuTrigger>
        <ActionMenuContent title="Reactions" align={isOwnMessage ? "end" : "start"} className="w-56">
          <p className="px-3 pb-1 pt-1 text-sm font-semibold text-muted-foreground">
            {reactions.length} {reactions.length === 1 ? "reaction" : "reactions"}
          </p>
          {people.map((r) => {
            const mine = r.user_id === currentUserId;
            return (
              <ActionMenuItem key={r.user_id} disabled={!mine} onClick={() => mine && onRemoveMine()} className="justify-between disabled:opacity-100">
                <span className="min-w-0">
                  <span className="block truncate">{mine ? "You" : nameOf(r.user_id)}</span>
                  {mine && <span className="block text-xs font-normal text-muted-foreground">Tap to remove</span>}
                </span>
                {hasReactionEmoji(r.reaction_type) ? <ReactionEmoji type={r.reaction_type} className="h-6 w-6" /> : <span className="text-xl leading-none">{reactionEmoji(r.reaction_type)}</span>}
              </ActionMenuItem>
            );
          })}
        </ActionMenuContent>
      </ActionMenu>
    </div>
  );
};

export default ReactionChips;
