import { memo, useState } from "react";
import { format } from "date-fns";
import { Copy, CornerUpLeft, Forward, MoreHorizontal, Pencil, SmilePlus, Star, StarOff, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import VoiceMessagePlayer from "@/components/VoiceMessagePlayer";
import MessageActionSheet, { type MessageAction } from "@/components/chat/MessageActionSheet";
import ReactionChips from "@/components/chat/ReactionChips";
import { SWIPE_REPLY_THRESHOLD, useSwipeToReply } from "@/hooks/use-swipe-to-reply";
import { useLongPress } from "@/hooks/use-long-press";
import type { ChatReaction } from "@/lib/chat-reactions";
import { nameColour } from "@/lib/group-chats";
import { MEDIA_PLACEHOLDERS, isVoiceNote, mediaKind, quoteText, voiceSeconds, type GroupMessage } from "@/lib/group-messages";
import { cn } from "@/lib/utils";
import { stickerId, stickerName, stickerUrl } from "@/lib/stickers";

interface GroupMessageBubbleProps {
  message: GroupMessage;
  mine: boolean;
  firstInRun: boolean;
  senderName: string;
  senderAvatar: string | null;
  /** The message this one replies to, if it's loaded. */
  quoted: GroupMessage | null;
  quotedName: string;
  reactions: ChatReaction[];
  currentUserId: string;
  nameOf: (userId: string) => string;
  onReact: (messageId: string, type: string | null) => void;
  onReply: (message: GroupMessage) => void;
  onEdit: (message: GroupMessage) => void;
  onDelete: (message: GroupMessage) => void;
  onOpenPhoto: (url: string) => void;
  starred?: boolean;
  onToggleStar?: (message: GroupMessage) => void;
  onForward?: (message: GroupMessage) => void;
  /** Briefly marks the message (after jumping to it from Starred or the gallery). */
  highlighted?: boolean;
}

/**
 * One message in a group chat: the sender's picture and name (in their colour) on the first of
 * a run, a quote when it's a reply, and reactions underneath. Swipe right to reply; press and
 * hold (or the buttons beside it with a mouse) for reactions, reply, copy, edit and delete.
 */
const GroupMessageBubble = ({
  message: m, mine, firstInRun, senderName, senderAvatar, quoted, quotedName, reactions, currentUserId, nameOf,
  onReact, onReply, onEdit, onDelete, onOpenPhoto, starred = false, onToggleStar, onForward, highlighted = false,
}: GroupMessageBubbleProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const pending = m.id.startsWith("temp-");
  const swipe = useSwipeToReply(() => { if (!pending) onReply(m); });
  const longPress = useLongPress(() => { if (!pending) setMenuOpen(true); });

  const voice = isVoiceNote(m);
  const kind = m.image_url && !voice ? mediaKind(m.image_url) : null;
  // A sticker stands on its own: big, with no bubble around it.
  const sticker = stickerId(m.content);
  const showText = !voice && !sticker && !(m.image_url && MEDIA_PLACEHOLDERS.includes(m.content));
  const mineReaction = reactions.find((r) => r.user_id === currentUserId)?.reaction_type ?? null;
  const time = format(new Date(m.created_at), "HH:mm");

  const actions: MessageAction[] = [
    { label: "Reply", icon: <CornerUpLeft className="mr-2 h-4 w-4" />, onSelect: () => onReply(m) },
    ...(onForward ? [{ label: "Forward", icon: <Forward className="mr-2 h-4 w-4" />, onSelect: () => onForward(m) }] : []),
    ...(onToggleStar ? [{ label: starred ? "Unstar" : "Star", icon: starred ? <StarOff className="mr-2 h-4 w-4" /> : <Star className="mr-2 h-4 w-4" />, onSelect: () => onToggleStar(m) }] : []),
    ...(showText ? [{ label: "Copy", icon: <Copy className="mr-2 h-4 w-4" />, onSelect: () => void navigator.clipboard?.writeText(m.content) }] : []),
    ...(mine && !m.image_url && !sticker ? [{ label: "Edit", icon: <Pencil className="mr-2 h-4 w-4" />, onSelect: () => onEdit(m) }] : []),
    ...(mine ? [{ label: "Delete", icon: <Trash2 className="mr-2 h-4 w-4" />, onSelect: () => onDelete(m), destructive: true }] : []),
  ];

  return (
    <div
      className={cn("group relative flex touch-pan-y items-end gap-1.5", mine ? "justify-end" : "justify-start", firstInRun ? "pt-2" : "pt-0.5")}
      {...swipe.handlers}
    >
      {swipe.swiping && (
        <span
          aria-hidden="true"
          className="absolute left-1 top-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/25 text-white"
          style={{ opacity: Math.min(1, swipe.offset / SWIPE_REPLY_THRESHOLD), transform: `translateY(-50%) scale(${0.6 + 0.4 * Math.min(1, swipe.offset / SWIPE_REPLY_THRESHOLD)})` }}
        >
          <CornerUpLeft className="h-4 w-4" />
        </span>
      )}
      {!mine && (
        <div className="w-8 flex-shrink-0 self-start pt-0.5">
          {firstInRun && (
            <Avatar className="h-8 w-8">
              <AvatarImage src={senderAvatar || undefined} />
              <AvatarFallback className="text-[11px]">{senderName[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
          )}
        </div>
      )}

      {/* With a mouse: react, reply and more, beside the message on hover. */}
      {!pending && (
        <div className={cn(
          "hidden flex-shrink-0 items-center gap-0.5 self-center transition-opacity duration-150 [@media(hover:hover)]:flex",
          menuOpen ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100",
          mine ? "order-first" : "order-last"
        )}>
          <button type="button" onClick={() => setMenuOpen(true)} className="rounded-full p-1.5 hover:bg-accent" aria-label="React" title="React">
            <SmilePlus className="h-4 w-4 text-muted-foreground" />
          </button>
          <button type="button" onClick={() => onReply(m)} className="rounded-full p-1.5 hover:bg-accent" aria-label="Reply" title="Reply">
            <CornerUpLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <button type="button" onClick={() => setMenuOpen(true)} className="rounded-full p-1.5 hover:bg-accent" aria-label="More actions" title="More">
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      )}

      <div
        className={cn("flex min-w-0 max-w-[78%] flex-col", (voice || m.image_url) && "w-[78%] max-w-[300px]", mine ? "items-end" : "items-start", !swipe.swiping && "transition-transform duration-200 ease-out")}
        style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined}
      >
        <div
          data-message-bubble
          className={cn(
            "relative w-full rounded-lg px-2.5 pb-1.5 pt-1 [-webkit-touch-callout:none] [@media(hover:none)]:select-none",
            sticker
              ? "w-auto bg-transparent px-0 pb-0 text-foreground"
              : cn("shadow-sm", mine ? "bg-primary text-primary-foreground dark:bg-[#8a3412] dark:text-white" : "bg-card text-foreground dark:bg-[#232327]"),
            !sticker && firstInRun && (mine ? "rounded-tr-none" : "rounded-tl-none"),
            pending && "opacity-70",
            (menuOpen || highlighted) && "ring-2 ring-primary/40",
            highlighted && "animate-pulse"
          )}
          {...longPress.handlers}
          onClickCapture={(e) => {
            // The tap that ends a press-and-hold shouldn't also open the photo.
            if (!e.currentTarget.contains(e.target as Node)) return; // a tap in the (portalled) menu
            if (longPress.fired.current) { e.preventDefault(); e.stopPropagation(); longPress.fired.current = false; }
          }}
        >
          <MessageActionSheet
            open={menuOpen}
            onOpenChange={setMenuOpen}
            myReaction={mineReaction}
            onReact={(type) => onReact(m.id, type)}
            actions={actions}
            align={mine ? "end" : "start"}
          />
          {!mine && firstInRun && <p className={cn("text-[13px] font-semibold", nameColour(m.user_id))}>{senderName}</p>}
          {m.forwarded && (
            <p className="flex items-center gap-1 text-[12px] italic opacity-75"><Forward className="h-3 w-3" /> Forwarded</p>
          )}
          {m.reply_to && (
            <div className={cn(
              "my-1 min-w-[160px] rounded-md border-l-4 px-2 py-1 text-[13px] leading-snug",
              mine ? "border-white/70 bg-black/15" : "border-primary bg-black/5 dark:bg-white/5"
            )}>
              <p className={cn("text-xs font-semibold", mine ? "opacity-90" : quoted ? nameColour(quoted.user_id) : "text-primary")}>
                {quoted ? quotedName : "Earlier message"}
              </p>
              <p className="max-w-[240px] truncate opacity-80">{quoted ? quoteText(quoted).substring(0, 80) : "Scroll up to see it"}</p>
            </div>
          )}
          {sticker ? (
            <img src={stickerUrl(sticker)} alt={`${stickerName(sticker)} sticker`} draggable={false} className="block h-32 w-32 select-none object-contain drop-shadow-md animate-sticker-pop" />
          ) : voice ? (
            <VoiceMessagePlayer audioUrl={m.image_url!} duration={voiceSeconds(m.content)} isOwnMessage={mine} />
          ) : m.image_url && kind === "video" ? (
            <video src={m.image_url} controls playsInline preload="metadata" className="mt-1 max-h-72 w-full rounded-md bg-black" />
          ) : m.image_url ? (
            <button type="button" className="mt-1 block overflow-hidden rounded-md" onClick={() => onOpenPhoto(m.image_url!)} aria-label={kind === "gif" ? "GIF" : "Open photo"}>
              <img src={m.image_url} alt="" loading="lazy" className="max-h-80 w-full object-cover" />
            </button>
          ) : null}
          {showText && (
            <p className={cn("whitespace-pre-wrap break-words text-[15px] leading-snug", m.image_url && "mt-1")}>
              {m.content}
              {/* Room for the time, which sits in the bottom corner. */}
              <span className={cn("ml-2 inline-block", m.edited_at ? "w-[4.5rem]" : "w-9", starred && "pl-4")} aria-hidden="true" />
            </p>
          )}
          <p className={cn(
            "text-right text-[10.5px] leading-none",
            sticker ? "absolute bottom-1 right-1 rounded-full bg-black/55 px-1.5 py-1 text-white" : showText ? "-mt-3.5" : "mt-1",
            !sticker && (mine ? "text-white/70" : "text-muted-foreground")
          )}>
            {starred && <Star className="mr-1 inline h-3 w-3 -translate-y-px fill-current" aria-label="Starred" />}
            {m.edited_at && <span className="mr-1">edited</span>}
            {time}
          </p>
        </div>
        <ReactionChips
          reactions={reactions}
          currentUserId={currentUserId}
          nameOf={nameOf}
          onRemoveMine={() => onReact(m.id, null)}
          isOwnMessage={mine}
        />
      </div>
    </div>
  );
};

export default memo(GroupMessageBubble);
