import { useState } from "react";
import { cn } from "@/lib/utils";
import { SWIPE_REPLY_THRESHOLD, useSwipeToReply } from "@/hooks/use-swipe-to-reply";
import { Check, CheckCheck, CornerUpLeft, Pencil, Trash2, MoreHorizontal, Copy, SmilePlus, Forward, Star, StarOff } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import VoiceMessagePlayer from "./VoiceMessagePlayer";
import MessageActionSheet, { type MessageAction } from "@/components/chat/MessageActionSheet";
import ReactionChips from "@/components/chat/ReactionChips";
import { useMessageReactions } from "@/hooks/use-message-reactions";
import { useLongPress } from "@/hooks/use-long-press";

/** The length saved in a voice note's text, "🎤 Voice message (1:05)" → 65. */
const voiceSeconds = (content: string) => {
  const m = content.match(/\((\d+):(\d{2})\)\s*$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};

interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
  read: boolean;
  image_url?: string | null;
  reply_to?: string | null;
  edited?: boolean;
  deleted_at?: string | null;
  expires_at?: string | null;
  forwarded?: boolean;
  /** When it reached the other person's app (two grey ticks). */
  delivered_at?: string | null;
}

interface ChatBubbleProps {
  message: ChatMessage;
  isCurrentUser: boolean;
  isLastOwnMessage: boolean;
  isLastMessage: boolean;
  currentUserId: string;
  replyMessage?: ChatMessage | null;
  onReply: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onUnsend: (messageId: string) => void;
  theme?: string;
  /** First of a run of messages from the same person: gets the little tail, as in WhatsApp. */
  isFirstInGroup?: boolean;
  /** The other person's name, shown on quotes of their messages. */
  otherName?: string | null;
  starred?: boolean;
  onToggleStar?: (message: ChatMessage) => void;
  onForward?: (message: ChatMessage) => void;
}

const themeColors: Record<string, { sent: string; received: string }> = {
  // Dark mode: a deep teal for your messages and a raised grey for theirs, as WhatsApp does.
  default: { sent: "bg-primary text-primary-foreground dark:bg-[#0b5d53] dark:text-white", received: "bg-card text-foreground dark:bg-[#22262d]" },
  ocean: { sent: "bg-blue-600 text-white", received: "bg-blue-100 dark:bg-blue-900/40 text-foreground" },
  sunset: { sent: "bg-orange-700 text-white", received: "bg-orange-100 dark:bg-orange-900/40 text-foreground" },
  forest: { sent: "bg-green-700 text-white", received: "bg-green-100 dark:bg-green-900/40 text-foreground" },
  lavender: { sent: "bg-purple-600 text-white", received: "bg-purple-100 dark:bg-purple-900/40 text-foreground" },
  crimson: { sent: "bg-red-600 text-white", received: "bg-red-100 dark:bg-red-900/40 text-foreground" },
  midnight: { sent: "bg-indigo-600 text-white", received: "bg-indigo-100 dark:bg-indigo-900/40 text-foreground" },
};

const ChatBubble = ({
  message,
  isCurrentUser,
  currentUserId,
  replyMessage,
  onReply,
  onEdit,
  onUnsend,
  theme = "default",
  isFirstInGroup = true,
  otherName,
  starred = false,
  onToggleStar,
  onForward,
}: ChatBubbleProps) => {
  // WhatsApp's message menu: press and hold on phones, the buttons by the message on computers.
  const [menuOpen, setMenuOpen] = useState(false);
  const colors = themeColors[theme] || themeColors.default;
  const { reactions, mine, react } = useMessageReactions(message.id, currentUserId);
  const longPress = useLongPress(() => setMenuOpen(true));
  // Swipe a message to the right to reply to it, as on WhatsApp.
  const swipe = useSwipeToReply(() => onReply(message));

  // Deleted message
  if (message.deleted_at) {
    return (
      <div className={cn("flex", isCurrentUser ? "justify-end" : "justify-start")}>
        <div className="px-2.5 py-1.5 rounded-lg bg-card/80 dark:bg-[#22262d]/80 italic text-muted-foreground text-sm shadow-sm">
          This message was unsent
        </div>
      </div>
    );
  }

  const isVoice = message.image_url && message.content?.startsWith("🎤");
  const isMedia = message.image_url && !message.content?.startsWith("🎤");
  const isVideo = isMedia && (message.image_url?.includes('.mp4') || message.image_url?.includes('.mov') || message.image_url?.includes('.webm'));
  const isGif = isMedia && (message.image_url?.includes('giphy.com') || message.image_url?.includes('tenor.com'));
  const hasText = !!message.content && message.content !== "Sent an image" && !message.content.startsWith("🎤");

  const actions: MessageAction[] = [
    { label: "Reply", icon: <CornerUpLeft className="mr-2 h-4 w-4" />, onSelect: () => onReply(message) },
    ...(onForward ? [{ label: "Forward", icon: <Forward className="mr-2 h-4 w-4" />, onSelect: () => onForward(message) }] : []),
    ...(onToggleStar ? [{ label: starred ? "Unstar" : "Star", icon: starred ? <StarOff className="mr-2 h-4 w-4" /> : <Star className="mr-2 h-4 w-4" />, onSelect: () => onToggleStar(message) }] : []),
    ...(hasText ? [{ label: "Copy", icon: <Copy className="mr-2 h-4 w-4" />, onSelect: () => void navigator.clipboard?.writeText(message.content) }] : []),
    ...(isCurrentUser && !isMedia && !isVoice ? [{ label: "Edit", icon: <Pencil className="mr-2 h-4 w-4" />, onSelect: () => onEdit(message) }] : []),
    ...(isCurrentUser ? [{ label: "Unsend", icon: <Trash2 className="mr-2 h-4 w-4" />, onSelect: () => onUnsend(message.id), destructive: true }] : []),
  ];

  const sentAt = new Date(message.created_at);
  const time = format(sentAt, "HH:mm");
  const fullTime = isToday(sentAt) ? `Today ${time}` : isYesterday(sentAt) ? `Yesterday ${time}` : format(sentAt, "d MMM yyyy, HH:mm");

  // Time + read receipt, always visible inside the bubble (no hover needed).
  const meta = (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] leading-none whitespace-nowrap select-none",
        isMedia && !hasText
          ? "absolute bottom-2 right-2 rounded-full bg-black/55 text-white px-1.5 py-1"
          : cn("float-right ml-2 mt-1.5 translate-y-0.5", isCurrentUser ? "text-current" : "text-muted-foreground")
      )}
      title={fullTime}
    >
      {starred && <Star className="mr-0.5 h-3 w-3 fill-current" aria-label="Starred" />}
      {message.edited && <span className="mr-0.5">edited</span>}
      {time}
      {isCurrentUser &&
        // One grey tick: sent. Two grey: delivered to their app. Two blue: read (as on WhatsApp).
        (message.read ? (
          <CheckCheck className="h-3.5 w-3.5 ml-0.5 text-sky-400" strokeWidth={2.5} aria-label="Read" />
        ) : message.delivered_at ? (
          <CheckCheck className="h-3.5 w-3.5 ml-0.5 opacity-60" strokeWidth={2.5} aria-label="Delivered" />
        ) : (
          <Check className="h-3.5 w-3.5 ml-0.5 opacity-60" aria-label="Sent" />
        ))}
    </span>
  );

  return (
    <div
      className={cn("flex group relative touch-pan-y", isCurrentUser ? "justify-end" : "justify-start")}
      {...swipe.handlers}
    >
      {swipe.swiping && (
        <span
          aria-hidden="true"
          className="absolute left-1 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/25 text-white"
          style={{ opacity: Math.min(1, swipe.offset / SWIPE_REPLY_THRESHOLD), transform: `translateY(-50%) scale(${0.6 + 0.4 * Math.min(1, swipe.offset / SWIPE_REPLY_THRESHOLD)})` }}
        >
          <CornerUpLeft className="h-4 w-4" />
        </span>
      )}
      {/* Reply and the message menu, shown on hover with a mouse (phones press and hold instead). */}
      <div className={cn(
        "hidden [@media(hover:hover)]:flex items-center gap-0.5 flex-shrink-0 self-center transition-opacity duration-150",
        menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
        isCurrentUser ? "order-first mr-1" : "order-last ml-1"
      )}>
        <button
          onClick={() => setMenuOpen(true)}
          className="p-1.5 rounded-full hover:bg-accent transition-colors"
          aria-label="React"
          title="React"
        >
          <SmilePlus className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          onClick={() => onReply(message)}
          className="p-1.5 rounded-full hover:bg-accent transition-colors"
          aria-label="Reply"
          title="Reply"
        >
          <CornerUpLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          onClick={() => setMenuOpen(true)}
          className="p-1.5 rounded-full hover:bg-accent transition-colors"
          aria-label="More actions"
          title="More"
        >
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div
        className={cn("flex flex-col gap-0.5 min-w-0", isCurrentUser ? "items-end" : "items-start", !swipe.swiping && "transition-transform duration-200 ease-out")}
        style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined}
      >
        {/* Message bubble (tap to show actions on touch screens) */}
        <div
          className={cn(
            "max-w-[80vw] sm:max-w-[420px] relative shadow-sm",
            isCurrentUser ? colors.sent : colors.received,
            "rounded-lg",
            // The tail sits at the top corner of the first message in a run.
            isFirstInGroup && (isCurrentUser ? "rounded-tr-none" : "rounded-tl-none"),
            isMedia ? "p-1" : "px-2.5 py-1.5",
            "[@media(hover:none)]:select-none [-webkit-touch-callout:none]",
            menuOpen && "ring-2 ring-primary/40"
          )}
          {...longPress.handlers}
          onClickCapture={(e) => {
            // The tap that ends a press-and-hold shouldn't also open a photo or play a video.
            if (!e.currentTarget.contains(e.target as Node)) return; // a tap in the (portalled) menu
            if (longPress.fired.current) { e.preventDefault(); e.stopPropagation(); longPress.fired.current = false; }
          }}
        >
          <MessageActionSheet
            open={menuOpen}
            onOpenChange={setMenuOpen}
            myReaction={mine}
            onReact={(type) => void react(type)}
            actions={actions}
            align={isCurrentUser ? "end" : "start"}
          />
          {isFirstInGroup && (
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-0 h-3 w-2",
                isCurrentUser
                  ? cn(colors.sent, "-right-2 [clip-path:polygon(0_0,100%_0,0_100%)]")
                  : cn(colors.received, "-left-2 [clip-path:polygon(0_0,100%_0,100%_100%)]")
              )}
            />
          )}
          {message.forwarded && (
            <p className={cn("flex items-center gap-1 text-[12px] italic opacity-75", isMedia && "px-1.5 pt-0.5")}>
              <Forward className="h-3 w-3" /> Forwarded
            </p>
          )}
          {/* The message being replied to, quoted inside the bubble with a coloured bar (as in WhatsApp). */}
          {replyMessage && (
            <div className={cn(
              "mb-1 rounded-md border-l-4 px-2 py-1 text-[13px] leading-snug min-w-[160px]",
              isCurrentUser ? "bg-black/15 border-white/70" : "bg-black/5 dark:bg-white/5 border-primary",
              isMedia && "mx-1 mt-1"
            )}>
              <p className={cn("font-semibold text-xs", isCurrentUser ? "text-current opacity-90" : "text-primary")}>
                {replyMessage.sender_id === currentUserId ? "You" : otherName || "Them"}
              </p>
              <p className="truncate max-w-[240px] opacity-80">
                {replyMessage.deleted_at ? "Deleted message" : replyMessage.image_url && !replyMessage.content ? "📷 Photo" : replyMessage.content?.substring(0, 80)}
              </p>
            </div>
          )}
          {/* Voice */}
          {isVoice && message.image_url && (
            <VoiceMessagePlayer audioUrl={message.image_url} duration={voiceSeconds(message.content)} isOwnMessage={isCurrentUser} />
          )}
          {/* Video */}
          {isVideo && message.image_url && (
            <video src={message.image_url} controls className="rounded-md max-w-full max-h-64" />
          )}
          {/* GIF */}
          {isGif && message.image_url && (
            <img src={message.image_url} alt="GIF" className="rounded-md max-w-full max-h-52" />
          )}
          {/* Image */}
          {isMedia && !isVideo && !isGif && message.image_url && (
            <img
              src={message.image_url}
              alt="Shared"
              className="rounded-md max-w-full cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => window.open(message.image_url!, "_blank")}
            />
          )}
          {/* Text (time and ticks float at its end, like most messengers) */}
          {hasText ? (
            <p className={cn("text-[15px] leading-snug break-words whitespace-pre-wrap", isMedia && "px-2 pt-1 pb-1")}>
              {message.content}
              {meta}
            </p>
          ) : isVoice ? (
            <div className="flex justify-end px-1 pb-0.5">{meta}</div>
          ) : (
            meta
          )}
        </div>

        <ReactionChips
          reactions={reactions}
          currentUserId={currentUserId}
          nameOf={() => otherName || "Them"}
          onRemoveMine={() => void react(null)}
          isOwnMessage={isCurrentUser}
        />
      </div>
    </div>
  );
};

export type { ChatMessage };
export default ChatBubble;
