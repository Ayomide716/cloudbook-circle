import { useState } from "react";
import { cn } from "@/lib/utils";
import { Check, CheckCheck, CornerUpLeft, Pencil, Trash2, MoreHorizontal, Copy } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
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
  ocean: { sent: "bg-blue-500 text-white", received: "bg-blue-100 dark:bg-blue-900/40 text-foreground" },
  sunset: { sent: "bg-orange-500 text-white", received: "bg-orange-100 dark:bg-orange-900/40 text-foreground" },
  forest: { sent: "bg-green-600 text-white", received: "bg-green-100 dark:bg-green-900/40 text-foreground" },
  lavender: { sent: "bg-purple-500 text-white", received: "bg-purple-100 dark:bg-purple-900/40 text-foreground" },
  crimson: { sent: "bg-red-500 text-white", received: "bg-red-100 dark:bg-red-900/40 text-foreground" },
  midnight: { sent: "bg-indigo-600 text-white", received: "bg-indigo-100 dark:bg-indigo-900/40 text-foreground" },
};

const ChatBubble = ({
  message,
  isCurrentUser,
  isLastOwnMessage,
  isLastMessage,
  currentUserId,
  replyMessage,
  onReply,
  onEdit,
  onUnsend,
  theme = "default",
}: ChatBubbleProps) => {
  const [showActions, setShowActions] = useState(false);
  const colors = themeColors[theme] || themeColors.default;

  // Deleted message
  if (message.deleted_at) {
    return (
      <div className={cn("flex", isCurrentUser ? "justify-end" : "justify-start")}>
        <div className="px-3 py-2 rounded-[18px] bg-muted/50 border border-border/50 italic text-muted-foreground text-sm">
          🚫 This message was unsent
        </div>
      </div>
    );
  }

  const isVoice = message.image_url && message.content?.startsWith("🎤");
  const isMedia = message.image_url && !message.content?.startsWith("🎤");
  const isVideo = isMedia && (message.image_url?.includes('.mp4') || message.image_url?.includes('.mov') || message.image_url?.includes('.webm'));
  const isGif = isMedia && (message.image_url?.includes('giphy.com') || message.image_url?.includes('tenor.com'));

  return (
    <div
      className={cn("flex group relative", isCurrentUser ? "justify-end" : "justify-start")}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onTouchStart={() => setShowActions(true)}
    >
      {/* Action menu - appears on hover/touch, contained within the message row */}
      <div className={cn(
        "flex items-center gap-0.5 flex-shrink-0 transition-opacity duration-150",
        showActions ? "opacity-100" : "opacity-0 pointer-events-none",
        isCurrentUser ? "order-first mr-1" : "order-last ml-1"
      )}>
        <button
          onClick={() => onReply(message)}
          className="p-1.5 rounded-full hover:bg-accent transition-colors"
          title="Reply"
        >
          <CornerUpLeft className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        {isCurrentUser && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-full hover:bg-accent transition-colors">
                <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isCurrentUser ? "end" : "start"} className="w-40">
              {!isMedia && !isVoice && (
                <DropdownMenuItem onClick={() => onEdit(message)}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => navigator.clipboard.writeText(message.content)}>
                <Copy className="h-3.5 w-3.5 mr-2" /> Copy
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => onUnsend(message.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Unsend
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className={cn("flex flex-col gap-0.5", isCurrentUser ? "items-end" : "items-start")}>
        {/* Reply preview */}
        {replyMessage && (
          <div className={cn(
            "text-xs px-3 py-1.5 rounded-lg max-w-[240px] truncate border-l-2",
            isCurrentUser
              ? "bg-primary/10 border-primary/40 text-primary-foreground/70"
              : "bg-muted border-muted-foreground/30 text-muted-foreground"
          )}>
            ↩ {replyMessage.deleted_at ? "Deleted message" : replyMessage.content?.substring(0, 60)}
          </div>
        )}

        {/* Message bubble */}
        <div className={cn(
          "max-w-[280px] sm:max-w-[360px] relative",
          isCurrentUser ? colors.sent : colors.received,
          "rounded-[18px]",
          isCurrentUser ? "rounded-br-[4px]" : "rounded-bl-[4px]",
          isMedia ? "p-1" : "px-3 py-2"
        )}>
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
          {/* Text */}
          {message.content && message.content !== "Sent an image" && !message.content?.startsWith("🎤") && (
            <p className="text-[15px] leading-snug break-words whitespace-pre-wrap">
              {message.content}
            </p>
          )}
          {message.edited && (
            <span className={cn("text-[10px] opacity-60 ml-1", isCurrentUser ? "text-primary-foreground/60" : "text-muted-foreground")}>
              (edited)
            </span>
          )}
        </div>

        {/* Timestamp & read receipt */}
        <div className={cn(
          "flex items-center gap-1 px-1 transition-opacity",
          isCurrentUser ? "flex-row-reverse" : "flex-row",
          isLastOwnMessage || isLastMessage ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}>
          <span className="text-[11px] text-muted-foreground">
            {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
          </span>
          {isCurrentUser && (
            <span>
              {message.read ? (
                <CheckCheck className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Check className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </span>
          )}
        </div>

        <MessageReactions
          messageId={message.id}
          currentUserId={currentUserId}
          isOwnMessage={isCurrentUser}
        />
      </div>
    </div>
  );
};

export type { ChatMessage };
export default ChatBubble;
