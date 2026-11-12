import { useRef, useState, type ReactNode } from "react";
import { Archive, ArchiveRestore, BellOff, BellRing, Check, CheckCheck, ChevronDown, Pin, PinOff } from "@/components/icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ActionMenu, ActionMenuContent, ActionMenuItem, ActionMenuTrigger } from "@/components/ui/action-menu";
import type { ChatPrefs } from "@/lib/chat-prefs";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { previewText } from "@/lib/stickers";

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
  /** Groups: a rounded square instead of a circle, so they stand out from people. */
  square?: boolean;
  /** A green dot on the picture: they're active now. */
  online?: boolean;
  /** They're typing to you right now: "typing…" instead of the last message. */
  typing?: boolean;
  /** "Read" in the swipe actions: marks their messages as read without opening the chat. */
  onMarkRead?: () => void;
}

const SWIPE_ACTION_WIDTH = 76;

/**
 * One chat in the list, WhatsApp style: the time turns tangerine and a round count shows while there
 * are unread messages. Press and hold (or the ⌄ button on bigger screens) to pin, mute or archive.
 */
const ConversationRow = ({
  profile, lastMessage, unreadCount, currentUserId, selected, pinned, muted, archived, time, onOpen, onToggle, draft, preview, fallback, square, online, typing, onMarkRead,
}: ConversationRowProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const pressTimer = useRef<number>();
  const longPressed = useRef(false);
  const unread = unreadCount > 0;
  const name = profile.full_name || "Anonymous";

  // Swipe the row left to show Read (or Unread count gone), Mute and Archive, as in WhatsApp.
  const actions = [
    ...(onMarkRead && unread ? [{ key: "read", label: "Read", icon: <CheckCheck className="h-5 w-5" />, className: "bg-sky-600", run: onMarkRead }] : []),
    { key: "mute", label: muted ? "Unmute" : "Mute", icon: muted ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />, className: "bg-neutral-500", run: () => onToggle("muted") },
    { key: "archive", label: archived ? "Unarchive" : "Archive", icon: archived ? <ArchiveRestore className="h-5 w-5" /> : <Archive className="h-5 w-5" />, className: "bg-primary", run: () => onToggle("archived") },
  ];
  const openWidth = actions.length * SWIPE_ACTION_WIDTH;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const swipe = useRef<{ x: number; y: number; base: number; horizontal: boolean | null } | null>(null);
  const swiped = useRef(false);
  const close = () => setOffset(0);

  return (
    <div className="relative overflow-hidden">
      {/* The actions behind the row, shown as it slides left. */}
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={offset === 0} style={{ width: openWidth }}>
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            tabIndex={offset === 0 ? -1 : 0}
            onClick={() => { haptic(10); a.run(); close(); }}
            className={cn("flex h-full flex-col items-center justify-center gap-1 text-[12px] font-semibold text-white", a.className)}
            style={{ width: SWIPE_ACTION_WIDTH }}
          >
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
    <div
      className={cn(
        "group relative flex cursor-pointer select-none items-center gap-3 p-3 sm:p-4 [-webkit-touch-callout:none] touch-pan-y",
        selected ? "bg-accent" : "bg-background hover:bg-accent/50 active:bg-accent/60",
        !dragging && "transition-[transform,background-color] duration-200 [animation-timing-function:cubic-bezier(0.2,0,0,1)]"
      )}
      style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
      onClick={() => {
        if (swiped.current) { swiped.current = false; return; }
        if (offset) { close(); return; }
        if (longPressed.current) { longPressed.current = false; return; }
        onOpen();
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        swipe.current = { x: t.clientX, y: t.clientY, base: offset, horizontal: null };
      }}
      onTouchMove={(e) => {
        const g = swipe.current;
        if (!g) return;
        const t = e.touches[0];
        const dx = t.clientX - g.x, dy = t.clientY - g.y;
        if (g.horizontal === null && Math.hypot(dx, dy) > 8) g.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
        if (!g.horizontal) return;
        window.clearTimeout(pressTimer.current);
        setDragging(true);
        // Past the buttons it pulls with resistance.
        const next = Math.min(0, g.base + dx);
        setOffset(next < -openWidth ? -openWidth + (next + openWidth) * 0.3 : next);
      }}
      onTouchEnd={() => {
        const g = swipe.current;
        swipe.current = null;
        if (!g?.horizontal) return;
        swiped.current = true;
        setDragging(false);
        setOffset((o) => {
          const open = o < -SWIPE_ACTION_WIDTH * 0.8;
          if (open && g.base === 0) haptic(8);
          return open ? -openWidth : 0;
        });
        window.setTimeout(() => { swiped.current = false; }, 400);
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
      <span className="relative flex-shrink-0">
        <Avatar className={cn("h-12 w-12", square && "rounded-2xl")}>
          <AvatarImage src={profile.avatar_url || undefined} className="object-cover" />
          <AvatarFallback className={square ? "rounded-2xl" : undefined}>{fallback ?? (profile.full_name?.[0]?.toUpperCase() || "U")}</AvatarFallback>
        </Avatar>
        {online && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-green-500" aria-label="Active now" />}
      </span>
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
          {!draft && !typing && lastMessage?.sender_id === currentUserId && (
            <span className="flex-shrink-0">
              {lastMessage.read ? <CheckCheck className="h-3.5 w-3.5 text-sky-400" aria-label="Read" /> : lastMessage.delivered_at ? <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" aria-label="Delivered" /> : <Check className="h-3.5 w-3.5 text-muted-foreground" aria-label="Sent" />}
            </span>
          )}
          <p className={cn("flex-1 truncate text-sm", unread ? "font-medium text-foreground" : "text-muted-foreground")}>
            {typing ? (
              <span className="font-medium text-primary">typing…</span>
            ) : draft ? (
              <><span className="font-medium text-primary">Draft: </span>{draft}</>
            ) : preview ?? (lastMessage ? (lastMessage.deleted_at ? "Message unsent" : previewText(lastMessage.content)) : "")}
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
    </div>
  );
};

export default ConversationRow;
