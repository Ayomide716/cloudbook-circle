import { useRef, useState } from "react";
import { format } from "date-fns";
import PhotoViewer from "@/components/PhotoViewer";
import MessageActionSheet, { type MessageAction } from "@/components/chat/MessageActionSheet";
import UploadRing from "@/components/chat/UploadRing";
import { Check, CheckCheck, Clock, CornerUpLeft, RotateCcw, Trash2 } from "@/components/icons";
import { useLongPress } from "@/hooks/use-long-press";
import { themeColors } from "@/lib/chat-colors";
import { cn } from "@/lib/utils";

/** What an album needs of each photo's message (one-to-one and group messages both have it). */
export interface AlbumPhoto {
  id: string;
  content: string;
  created_at: string;
  image_url?: string | null;
  read?: boolean | null;
  delivered_at?: string | null;
  _preview?: string;
  _status?: "sending" | "failed";
  _progress?: number;
}

interface ChatAlbumProps<T extends AlbumPhoto> {
  photos: T[];
  isCurrentUser: boolean;
  isFirstInGroup?: boolean;
  theme?: string;
  onReply: (message: T) => void;
  onUnsend: (messageId: string) => void;
  onRetry?: (message: T) => void;
  /** Group chats: no read ticks, and the sender's name on top. */
  group?: boolean;
  senderName?: string;
  senderClass?: string;
}

/**
 * Four or more photos sent together, as one bubble: a 2×2 grid with "+3" on the last tile,
 * tap to see them all (as on WhatsApp). Press and hold for reply and delete.
 */
const ChatAlbum = <T extends AlbumPhoto>({ photos, isCurrentUser, isFirstInGroup = true, theme = "default", onReply, onUnsend, onRetry, group = false, senderName, senderClass }: ChatAlbumProps<T>) => {
  const [viewing, setViewing] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useLongPress(() => setMenuOpen(true));
  const bubbleRef = useRef<HTMLDivElement>(null);
  const colors = themeColors[theme] || themeColors.default;
  const last = photos[photos.length - 1];
  const caption = !["Sent an image", "📷 Photo"].includes(photos[0].content) ? photos[0].content : "";
  const srcs = photos.map((p) => p._preview ?? p.image_url ?? "");
  const sending = photos.filter((p) => p._status === "sending");
  const failed = photos.filter((p) => p._status === "failed");
  const progress = sending.length ? sending.reduce((n, p) => n + (p._progress ?? 0), 0) / sending.length : undefined;
  const allRead = photos.every((p) => p.read);
  const allDelivered = photos.every((p) => p.delivered_at || p.read);

  const actions: MessageAction[] = [
    { label: "Reply", icon: <CornerUpLeft className="mr-2 h-4 w-4" />, onSelect: () => onReply(photos[0]) },
    ...(failed.length && onRetry ? [{ label: "Try again", icon: <RotateCcw className="mr-2 h-4 w-4" />, onSelect: () => failed.forEach(onRetry) }] : []),
    ...(isCurrentUser ? [{ label: `Unsend all ${photos.length}`, icon: <Trash2 className="mr-2 h-4 w-4" />, onSelect: () => photos.forEach((p) => onUnsend(p.id)), destructive: true }] : []),
  ];

  return (
    <div className={cn("flex", isCurrentUser ? "justify-end" : "justify-start")}>
      <div
        ref={bubbleRef}
        className={cn(
          "relative w-[min(264px,72vw)] rounded-lg p-1 shadow-sm [-webkit-touch-callout:none] [@media(hover:none)]:select-none",
          isCurrentUser ? colors.sent : colors.received,
          isFirstInGroup && (isCurrentUser ? "rounded-tr-none" : "rounded-tl-none"),
          menuOpen && "ring-2 ring-primary/40",
        )}
        {...longPress.handlers}
        onClickCapture={(e) => {
          if (!e.currentTarget.contains(e.target as Node)) return;
          if (longPress.fired.current) { e.preventDefault(); e.stopPropagation(); longPress.fired.current = false; }
        }}
      >
        <MessageActionSheet open={menuOpen} onOpenChange={setMenuOpen} myReaction={null} onReact={() => {}} actions={actions} align={isCurrentUser ? "end" : "start"} anchorRef={bubbleRef} hideReactions />
        {senderName && <p className={cn("px-1 pb-0.5 text-[13px] font-semibold", senderClass)}>{senderName}</p>}
        <div className="grid grid-cols-2 gap-1">
          {srcs.slice(0, 4).map((src, i) => (
            <button key={photos[i].id} type="button" onClick={() => setViewing(i)} aria-label={`Photo ${i + 1} of ${photos.length}`}
              className="relative aspect-square overflow-hidden rounded-md bg-black/10">
              <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              {i === 3 && photos.length > 4 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-2xl font-semibold text-white">+{photos.length - 4}</span>
              )}
            </button>
          ))}
        </div>
        {(sending.length > 0 || failed.length > 0) && (
          <div className="pointer-events-none absolute inset-1 flex items-center justify-center rounded-md bg-black/25">
            {failed.length && !sending.length ? (
              <button type="button" onClick={(e) => { e.stopPropagation(); failed.forEach((p) => onRetry?.(p)); }}
                className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-2 text-[13px] font-semibold text-white">
                <RotateCcw className="h-4 w-4" /> Retry {failed.length}
              </button>
            ) : (
              <UploadRing progress={progress} />
            )}
          </div>
        )}
        {caption && <p className="whitespace-pre-wrap break-words px-1.5 pt-1 text-[15px] leading-snug">{caption}</p>}
        <span className={cn("inline-flex items-center gap-0.5 text-[10px] leading-none", caption ? "float-right mx-1 mt-1" : "absolute bottom-2 right-2 rounded-full bg-black/55 px-1.5 py-1 text-white")}>
          {format(new Date(last.created_at), "HH:mm")}
          {isCurrentUser && (group ? (sending.length ? <Clock className="ml-0.5 h-3 w-3 opacity-70" aria-label="Sending" /> : null) : sending.length ? <Clock className="ml-0.5 h-3 w-3 opacity-70" aria-label="Sending" />
            : allRead ? <CheckCheck className="ml-0.5 h-3.5 w-3.5 text-sky-400" strokeWidth={2.5} aria-label="Read" />
            : allDelivered ? <CheckCheck className="ml-0.5 h-3.5 w-3.5 opacity-70" strokeWidth={2.5} aria-label="Delivered" />
            : <Check className="ml-0.5 h-3.5 w-3.5 opacity-70" aria-label="Sent" />)}
        </span>
        {caption && <span className="block clear-both" />}
      </div>
      <PhotoViewer images={srcs} index={viewing} onIndexChange={setViewing} caption={`${(viewing ?? 0) + 1} of ${photos.length}`} />
    </div>
  );
};

export default ChatAlbum;
