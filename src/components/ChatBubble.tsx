import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Check, CheckCheck, CornerUpLeft, Pencil, Trash2, MoreHorizontal, Copy, SmilePlus } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import VoiceMessagePlayer from "./VoiceMessagePlayer";
import MessageReactions from "./MessageReactions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
}

const themeColors: Record<string, { sent: string; received: string }> = {
  default: { sent: "bg-primary text-primary-foreground", received: "bg-secondary text-foreground" },
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
}: ChatBubbleProps) => {
  const [showActions, setShowActions] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const colors = themeColors[theme] || themeColors.default;

  // On touch screens actions open with a tap; close them when tapping anywhere else.
  useEffect(() => {
    if (!showActions && !pickerOpen) return;
    const close = (e: PointerEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setShowActions(false);
        setPickerOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [showActions, pickerOpen]);

  // Deleted message
  if (message.deleted_at) {
    return (
      <div className={cn("flex", isCurrentUser ? "justify-end" : "justify-start")}>
        <div className="px-3 py-2 rounded-[18px] bg-muted/50 border border-border/50 italic text-muted-foreground text-sm">
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
      {message.edited && <span className="mr-0.5">edited</span>}
      {time}
      {isCurrentUser &&
        (message.read ? (
          <CheckCheck className="h-3.5 w-3.5 ml-0.5 opacity-100" strokeWidth={2.5} aria-label="Read" />
        ) : (
          <Check className="h-3.5 w-3.5 ml-0.5 opacity-60" aria-label="Sent" />
        ))}
    </span>
  );

  return (
    <div
      ref={rowRef}
      className={cn("flex group relative", isCurrentUser ? "justify-end" : "justify-start")}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setShowActions(true); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse" && !pickerOpen) setShowActions(false); }}
    >
      {/* Actions: hover on desktop, tap the bubble on phones */}
      <div className={cn(
        "flex items-center gap-0.5 flex-shrink-0 self-center transition-opacity duration-150",
        showActions || pickerOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        isCurrentUser ? "order-first mr-1" : "order-last ml-1"
      )}>
        <button
          onClick={() => { setPickerOpen((o) => !o); setShowActions(true); }}
          className="p-1.5 rounded-full hover:bg-accent transition-colors"
          aria-label="React"
          title="React"
        >
          <SmilePlus className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          onClick={() => { onReply(message); setShowActions(false); }}
          className="p-1.5 rounded-full hover:bg-accent transition-colors"
          aria-label="Reply"
          title="Reply"
        >
          <CornerUpLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        {isCurrentUser && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-full hover:bg-accent transition-colors" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isCurrentUser ? "end" : "start"} className="w-40">
              {!isMedia && !isVoice && (
                <DropdownMenuItem onClick={() => onEdit(message)}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                </DropdownMenuItem>
              )}
              {hasText && (
                <DropdownMenuItem onClick={() => navigator.clipboard.writeText(message.content)}>
                  <Copy className="h-3.5 w-3.5 mr-2" /> Copy
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-destructive" onClick={() => onUnsend(message.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Unsend
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className={cn("flex flex-col gap-0.5 min-w-0", isCurrentUser ? "items-end" : "items-start")}>
        {/* Reply preview */}
        {replyMessage && (
          <div className={cn(
            "text-xs px-3 py-1.5 rounded-lg max-w-[240px] truncate border-l-2 text-muted-foreground",
            isCurrentUser ? "bg-primary/10 border-primary/50" : "bg-muted border-muted-foreground/30"
          )}>
            {replyMessage.deleted_at ? "Deleted message" : replyMessage.content?.substring(0, 60)}
          </div>
        )}

        {/* Message bubble (tap to show actions on touch screens) */}
        <div
          className={cn(
            "max-w-[min(280px,75vw)] sm:max-w-[360px] relative",
            isCurrentUser ? colors.sent : colors.received,
            "rounded-[18px]",
            isCurrentUser ? "rounded-br-[4px]" : "rounded-bl-[4px]",
            isMedia ? "p-1" : "px-3 py-2"
          )}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("button, a, video, audio")) return;
            if (window.matchMedia("(hover: none)").matches) setShowActions((v) => !v);
          }}
        >
          {/* Voice */}
          {isVoice && message.image_url && (
            <VoiceMessagePlayer audioUrl={message.image_url} isOwnMessage={isCurrentUser} />
          )}
          {/* Video */}
          {isVideo && message.image_url && (
            <video src={message.image_url} controls className="rounded-[14px] max-w-full max-h-64" />
          )}
          {/* GIF */}
          {isGif && message.image_url && (
            <img src={message.image_url} alt="GIF" className="rounded-[14px] max-w-full max-h-52" />
          )}
          {/* Image */}
          {isMedia && !isVideo && !isGif && message.image_url && (
            <img
              src={message.image_url}
              alt="Shared"
              className="rounded-[14px] max-w-full cursor-pointer hover:opacity-90 transition-opacity"
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

        <MessageReactions
          messageId={message.id}
          currentUserId={currentUserId}
          isOwnMessage={isCurrentUser}
          pickerOpen={pickerOpen}
          onPickerOpenChange={(open) => { setPickerOpen(open); if (!open) setShowActions(false); }}
        />
      </div>
    </div>
  );
};

export type { ChatMessage };
export default ChatBubble;
