import { useRef, useState, type ReactNode } from "react";
import { Archive, ArchiveRestore, BellOff, BellRing, Check, CheckCheck, ChevronDown, Pin, PinOff } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ActionMenu, ActionMenuContent, ActionMenuItem, ActionMenuTrigger } from "@/components/ui/action-menu";
import type { ChatPrefs } from "@/lib/chat-prefs";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

interface ConversationRowProps {
  profile: { id: string; full_name: string | null; avatar_url: string | null };
  lastMessage?: { sender_id: string; content: string; created_at: string; read: boolean; deleted_at?: string | null; delivered_at?: string | null };
  unreadCount: number;
  currentUserId: string;
  selected: boolean;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  time?: string;
  onOpen: () => void;
  onToggle: (list: keyof ChatPrefs) => void;
  /** Text typed but not sent, shown as "Draft: …" (as on WhatsApp). */
  draft?: string;
  /** Shown instead of the last message (group chats: "Ada: hello"). */
  preview?: string;
  /** In the picture's place when there's no picture (a group icon for groups). */
  fallback?: ReactNode;
}

/**
 * One chat in the list, WhatsApp style: the time turns tangerine and a round count shows while there
 * are unread messages. Press and hold (or the ⌄ button on bigger screens) to pin, mute or archive.
 */
const ConversationRow = ({
  profile, lastMessage, unreadCount, currentUserId, selected, pinned, muted, archived, time, onOpen, onToggle, draft, preview, fallback,
}: ConversationRowProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const pressTimer = useRef<number>();
  const longPressed = useRef(false);
  const unread = unreadCount > 0;
  const name = profile.full_name || "Anonymous";

  return (
    <div
      className={cn(
        "group relative flex cursor-pointer select-none items-center gap-3 p-3 transition-colors sm:p-4 [-webkit-touch-callout:none]",
        selected ? "bg-accent" : "hover:bg-accent/50 active:bg-accent/60"
      )}
      onClick={() => {
        if (longPressed.current) { longPressed.current = false; return; }
        onOpen();
      }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return;
        longPressed.current = false;
        window.clearTimeout(pressTimer.current);
        pressTimer.current = window.setTimeout(() => {
          longPressed.current = true;
          haptic(15);
          setMenuOpen(true);
        }, 450);
      }}
      onPointerUp={() => window.clearTimeout(pressTimer.current)}
      onPointerMove={() => window.clearTimeout(pressTimer.current)}
      onPointerCancel={() => window.clearTimeout(pressTimer.current)}
      onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
    >
      <Avatar className="h-12 w-12 flex-shrink-0">
        <AvatarImage src={profile.avatar_url || undefined} className="object-cover" />
        <AvatarFallback className={cn(fallback && "bg-secondary")}>{fallback ?? (profile.full_name?.[0]?.toUpperCase() || "U")}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-semibold">{name}</p>
          {time && (
            <span className={cn("flex-shrink-0 text-[11px]", unread && !muted ? "font-semibold text-primary" : "text-muted-foreground")}>
              {time}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1">
          {!draft && lastMessage?.sender_id === currentUserId && (
            <span className="flex-shrink-0">
              {lastMessage.read ? <CheckCheck className="h-3.5 w-3.5 text-sky-400" aria-label="Read" /> : lastMessage.delivered_at ? <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" aria-label="Delivered" /> : <Check className="h-3.5 w-3.5 text-muted-foreground" aria-label="Sent" />}
            </span>
          )}
          <p className={cn("flex-1 truncate text-sm", unread ? "font-medium text-foreground" : "text-muted-foreground")}>
            {draft ? (
              <><span className="font-medium text-primary">Draft: </span>{draft}</>
            ) : preview ?? (lastMessage ? (lastMessage.deleted_at ? "Message unsent" : lastMessage.content) : "")}
          </p>
          {muted && <BellOff className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-label="Muted" />}
          {pinned && <Pin className="h-3.5 w-3.5 flex-shrink-0 rotate-45 text-muted-foreground" aria-label="Pinned" />}
          {unread && (
            <span
              className={cn(
                "flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
                muted ? "bg-muted-foreground/40 text-background" : "bg-primary text-primary-foreground"
              )}
              aria-label={`${unreadCount} unread`}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
      </div>

      {/* The sheet is portalled but React still bubbles its taps here: keep them off the row. */}
      <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <ActionMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <ActionMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Options for ${name}`}
            className="absolute right-2 top-2 hidden h-7 w-7 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm group-hover:flex [@media(hover:none)]:!hidden"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </ActionMenuTrigger>
        <ActionMenuContent align="end" title={`Chat with ${name}`}>
          <ActionMenuItem onSelect={() => onToggle("pinned")}>
            {pinned ? <PinOff className="h-4 w-4 mr-2" /> : <Pin className="h-4 w-4 mr-2" />}
            {pinned ? "Unpin chat" : "Pin chat"}
          </ActionMenuItem>
          <ActionMenuItem onSelect={() => onToggle("muted")}>
            {muted ? <BellRing className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />}
            {muted ? "Unmute" : "Mute"}
          </ActionMenuItem>
          <ActionMenuItem onSelect={() => onToggle("archived")}>
            {archived ? <ArchiveRestore className="h-4 w-4 mr-2" /> : <Archive className="h-4 w-4 mr-2" />}
            {archived ? "Unarchive chat" : "Archive chat"}
          </ActionMenuItem>
        </ActionMenuContent>
      </ActionMenu>
      </div>
    </div>
  );
};

export default ConversationRow;
