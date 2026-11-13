import { useRef, useState } from "react";
import PhotoViewer from "@/components/PhotoViewer";
import { cn } from "@/lib/utils";
import { SWIPE_REPLY_THRESHOLD, useSwipeToReply } from "@/hooks/use-swipe-to-reply";
import { Check, CheckCheck, CornerUpLeft, Pencil, Trash2, MoreHorizontal, Copy, SmilePlus, Forward, Star, StarOff, Clock, AlertCircle, RotateCcw, CheckCircle2, Ban, Pin, PinOff, Info } from "@/components/icons";
import { format, isToday, isYesterday } from "date-fns";
import VoiceMessagePlayer from "./VoiceMessagePlayer";
import LinkPreview from "./LinkPreview";
import LinkedText from "./LinkedText";
import { firstLink } from "@/lib/links";
import MessageActionSheet, { type MessageAction } from "@/components/chat/MessageActionSheet";
import ReactionChips from "@/components/chat/ReactionChips";
import { useMessageReactions } from "@/hooks/use-message-reactions";
import { useLongPress } from "@/hooks/use-long-press";
import { GIPHY_STICKER, previewText, stickerId, stickerName, stickerUrl } from "@/lib/stickers";
import { isGiphyMedia } from "@/lib/giphy";
import ViewOnceBubble from "@/components/chat/ViewOnceBubble";
import { isViewOnce } from "@/lib/view-once";
import { mediaSize } from "@/lib/chat-media";
import { themeColors } from "@/lib/chat-colors";
import { emojiOnlyCount } from "@/lib/emoji-only";
import { storyReplyOf } from "@/lib/story-reply";
import { readEvent, readFile, readPoll, readQuote } from "@/lib/chat-extras";
import { EventCard, FileCard, PollCard, QuoteBlock } from "@/components/chat/MessageExtras";
import UploadRing from "@/components/chat/UploadRing";

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
  /** A view-once photo (lib/view-once), and when they opened it. */
  view_once?: boolean;
  view_once_opened_at?: string | null;
  // Only on this phone, while a message you sent is on its way:
  /** Sending (with its upload, 0-100, for a photo or video), or couldn't send. */
  _status?: "sending" | "failed";
  _progress?: number;
  /** The photo or video from the phone, shown while (and after) it uploads. */
  _preview?: string;
  _video?: boolean;
  /** When they read it (Message info). */
  read_at?: string | null;
  /** A document, a poll, an event, or a quote from a group (lib/chat-extras). */
  file?: unknown;
  poll?: unknown;
  event?: unknown;
  quote?: unknown;
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
  /** First of a run of messages from the same person: keeps all four corners round. */
  isFirstInGroup?: boolean;
  /** The other person's name, shown on quotes of their messages. */
  otherName?: string | null;
  starred?: boolean;
  onToggleStar?: (message: ChatMessage) => void;
  onForward?: (message: ChatMessage) => void;
  /** Try again to send a message that couldn't go. */
  onRetry?: (message: ChatMessage) => void;
  /** Start picking messages, with this one (Select in the menu). */
  onSelect?: (message: ChatMessage) => void;
  /** Delete: for me, or for everyone (asks which). Without it, Unsend deletes for everyone. */
  onDelete?: (message: ChatMessage) => void;
  /** Pin to the top of the chat, or unpin. */
  onPin?: (message: ChatMessage) => void;
  pinned?: boolean;
  /** Message info: when it was delivered and read. */
  onInfo?: (message: ChatMessage) => void;
  /** Blue ticks: off when either of you turned read receipts off. */
  showRead?: boolean;
}


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
  onRetry,
  onSelect,
  onDelete,
  onPin,
  pinned = false,
  onInfo,
  showRead = true,
}: ChatBubbleProps) => {
  // WhatsApp's message menu: press and hold on phones, the buttons by the message on computers.
  const [menuOpen, setMenuOpen] = useState(false);
  // The photo, full screen (pinch to zoom, pull down to close).
  const [viewing, setViewing] = useState<number | null>(null);
  const colors = themeColors[theme] || themeColors.default;
  const { reactions, mine, react } = useMessageReactions(message.id, currentUserId);
  const longPress = useLongPress(() => setMenuOpen(true));
  const bubbleRef = useRef<HTMLDivElement>(null);
  // Swipe a message to the right to reply to it, as on WhatsApp.
  const swipe = useSwipeToReply(() => onReply(message));

  // Deleted message
  if (message.deleted_at) {
    return (
      <div className={cn("flex", isCurrentUser ? "justify-end" : "justify-start")}>
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-chat-surface/80 italic text-muted-foreground text-sm shadow-sm">
          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
          {isCurrentUser ? "You deleted this message" : "This message was deleted"}
        </div>
      </div>
    );
  }

  const file = readFile(message.file);
  const poll = readPoll(message.poll);
  const event = readEvent(message.event);
  const quote = readQuote(message.quote);
  const card = !!(file || poll || event);
  // A reply or reaction to a story: the story's picture as a small quote beside it.
  const story = storyReplyOf(message);
  const isVoice = message.image_url && message.content?.startsWith("🎤");
  // A sticker stands on its own: big, with no bubble around it. One of Ember's 3D ones, or an
  // animated one from GIPHY (its address is the message's image).
  const ownSticker = stickerId(message.content);
  const stickerSrc = ownSticker
    ? stickerUrl(ownSticker)
    : message.content === GIPHY_STICKER && isGiphyMedia(message.image_url) ? message.image_url : null;
  const stickerAlt = ownSticker ? `${stickerName(ownSticker)} sticker` : "Sticker";
  const isMedia = !story && message.image_url && !stickerSrc && !message.content?.startsWith("🎤");
  const isVideo = isMedia && (!!message._video || message.image_url?.includes('.mp4') || message.image_url?.includes('.mov') || message.image_url?.includes('.webm'));
  const isGif = isMedia && (message.image_url?.includes('giphy.com') || message.image_url?.includes('tenor.com'));
  const once = isViewOnce(message);
  // What's on screen: the photo from this phone while (and after) it uploads.
  const src = message._preview ?? message.image_url ?? undefined;
  const size = mediaSize(message.image_url);
  // Room for the photo before it loads: up to 220 wide and 280 tall (about WhatsApp's size).
  const box = size ? { width: Math.round(Math.min(220, (280 * size.w) / size.h)), aspectRatio: `${size.w} / ${size.h}` } : undefined;
  const sending = message._status === "sending";
  const failed = message._status === "failed";
  const hasText = !card && !once && !stickerSrc && !!message.content && message.content !== "Sent an image" && !(isMedia && message.content === "Sent a video") && !message.content.startsWith("🎤");

  const actions: MessageAction[] = [
    { label: "Reply", icon: <CornerUpLeft className="mr-2 h-4 w-4" />, onSelect: () => onReply(message) },
    ...(onForward && !once ? [{ label: "Forward", icon: <Forward className="mr-2 h-4 w-4" />, onSelect: () => onForward(message) }] : []),
    ...(onToggleStar ? [{ label: starred ? "Unstar" : "Star", icon: starred ? <StarOff className="mr-2 h-4 w-4" /> : <Star className="mr-2 h-4 w-4" />, onSelect: () => onToggleStar(message) }] : []),
    ...(hasText ? [{ label: "Copy", icon: <Copy className="mr-2 h-4 w-4" />, onSelect: () => void navigator.clipboard?.writeText(message.content) }] : []),
    ...(isCurrentUser && !isMedia && !isVoice && !stickerSrc ? [{ label: "Edit", icon: <Pencil className="mr-2 h-4 w-4" />, onSelect: () => onEdit(message) }] : []),
    ...(failed && onRetry ? [{ label: "Try again", icon: <RotateCcw className="mr-2 h-4 w-4" />, onSelect: () => onRetry(message) }] : []),
    ...(onSelect && !message.id.startsWith("temp-") ? [{ label: "Select", icon: <CheckCircle2 className="mr-2 h-4 w-4" />, onSelect: () => onSelect(message) }] : []),
    ...(onPin && !message.id.startsWith("temp-") ? [{ label: pinned ? "Unpin" : "Pin", icon: pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />, onSelect: () => onPin(message) }] : []),
    ...(onInfo && isCurrentUser && !message.id.startsWith("temp-") ? [{ label: "Info", icon: <Info className="mr-2 h-4 w-4" />, onSelect: () => onInfo(message) }] : []),
    ...(onDelete
      ? [{ label: "Delete", icon: <Trash2 className="mr-2 h-4 w-4" />, onSelect: () => onDelete(message), destructive: true }]
      : isCurrentUser ? [{ label: "Unsend", icon: <Trash2 className="mr-2 h-4 w-4" />, onSelect: () => onUnsend(message.id), destructive: true }] : []),
  ];

  // The first link in the message, shown as a card under it.
  const chatLink = hasText ? firstLink(message.content) : null;
  // One to three emoji and nothing else: shown big, with no bubble (as on WhatsApp).
  const bigEmoji = hasText && !isMedia && !story && !replyMessage && !message.forwarded ? emojiOnlyCount(message.content) : 0;
  // A photo or video on its own is just the rounded picture, with no coloured frame around it.
  const photoOnly = !!isMedia && !hasText && !replyMessage && !message.forwarded;
  const bare = !!stickerSrc || bigEmoji > 0 || photoOnly;
  const sentAt = new Date(message.created_at);
  const time = format(sentAt, "HH:mm");
  const fullTime = isToday(sentAt) ? `Today ${time}` : isYesterday(sentAt) ? `Yesterday ${time}` : format(sentAt, "d MMM yyyy, HH:mm");

  // Time + read receipt, always visible inside the bubble (no hover needed).
  const meta = (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] leading-none whitespace-nowrap select-none",
        stickerSrc || bigEmoji
          ? "absolute bottom-1 right-1 rounded-full bg-black/55 text-white px-1.5 py-1"
          : isMedia && !hasText
          ? "absolute bottom-2 right-2 rounded-full bg-black/55 text-white px-1.5 py-1"
          : cn("float-right ml-2 mt-1.5 translate-y-0.5", isCurrentUser ? "text-current" : "text-muted-foreground")
      )}
      title={fullTime}
    >
      {starred && <Star className="mr-0.5 h-3 w-3 fill-current" aria-label="Starred" />}
      {message.edited && <span className="mr-0.5">edited</span>}
      {time}
      {isCurrentUser && sending ? (
        <Clock className="h-3 w-3 ml-0.5 opacity-60" aria-label="Sending" />
      ) : isCurrentUser && failed ? null : isCurrentUser &&
        // One grey tick: sent. Two grey: delivered to their app. Two blue: read (as on WhatsApp).
        (message.read && showRead ? (
          <CheckCheck className="h-3.5 w-3.5 ml-0.5 text-sky-400" strokeWidth={2.5} aria-label="Read" />
        ) : message.delivered_at || message.read ? (
          <CheckCheck className="h-3.5 w-3.5 ml-0.5 opacity-60" strokeWidth={2.5} aria-label="Delivered" />
        ) : (
          <Check className="h-3.5 w-3.5 ml-0.5 opacity-60" aria-label="Sent" />
        ))}
    </span>
  );

  // A message you just sent pops up from the corner; a new one from them slides in.
  const justArrived = isCurrentUser
    ? message.id.startsWith("temp-")
    : !!message.created_at && Date.now() - new Date(message.created_at).getTime() < 3000;

  return (
    <div
      className={cn(
        "flex group relative touch-pan-y",
        isCurrentUser ? "justify-end" : "justify-start",
        justArrived && "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-2 duration-200 [animation-timing-function:cubic-bezier(0.2,0,0,1)]",
        justArrived && (isCurrentUser ? "origin-bottom-right" : "origin-bottom-left"),
      )}
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

      {/* Couldn't send: a red "!" beside it; tap to try again. */}
      {failed && (
        <button type="button" onClick={() => onRetry?.(message)} aria-label="Couldn't send. Tap to try again" title="Tap to try again"
          className="order-first mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full text-destructive active:scale-90">
          <AlertCircle className="h-6 w-6" />
        </button>
      )}
      <div
        className={cn("flex flex-col gap-0.5 min-w-0", isCurrentUser ? "items-end" : "items-start", !swipe.swiping && "transition-transform duration-200 ease-out")}
        style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined}
      >
        {/* Message bubble (tap to show actions on touch screens) */}
        <div
          ref={bubbleRef}
          className={cn(
            "max-w-[80vw] sm:max-w-[420px] relative",
            bare ? "rounded-2xl" : cn("shadow-sm rounded-[18px]", isCurrentUser ? colors.sent : colors.received),
            // As in the redesign: round bubbles, no tail. Later messages in a run get a small top
            // corner on the sender's side, so a run reads as one block.
            !bare && !isFirstInGroup && (isCurrentUser ? "rounded-tr-md" : "rounded-tl-md"),
            stickerSrc || photoOnly ? "p-0" : bigEmoji ? "px-1 pb-7" : isMedia ? "p-1" : "px-3 py-1.5",
            photoOnly && "overflow-hidden",
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
            anchorRef={bubbleRef}
          />
          {message.forwarded && (
            <p className={cn("flex items-center gap-1 text-[12px] italic opacity-75", isMedia && "px-1.5 pt-0.5")}>
              <Forward className="h-3 w-3" /> Forwarded
            </p>
          )}
          {/* The message being replied to, quoted inside the bubble with a coloured bar (as in WhatsApp). */}
          {replyMessage && (
            <div className={cn(
              "mb-1 rounded-xl border-l-4 px-2 py-1 text-[13px] leading-snug min-w-[160px]",
              isCurrentUser ? "bg-black/15 border-white/70" : "bg-black/5 dark:bg-white/5 border-primary",
              isMedia && "mx-1 mt-1"
            )}>
              <p className={cn("font-semibold text-xs", isCurrentUser ? "text-current opacity-90" : "text-primary")}>
                {replyMessage.sender_id === currentUserId ? "You" : otherName || "Them"}
              </p>
              <p className="truncate max-w-[240px] opacity-80">
                {replyMessage.deleted_at ? "Deleted message" : replyMessage.image_url && !replyMessage.content ? "📷 Photo" : previewText(replyMessage.content)?.substring(0, 80)}
              </p>
            </div>
          )}
          {quote && <QuoteBlock quote={quote} mine={isCurrentUser} />}
          {file && <FileCard file={file} mine={isCurrentUser} />}
          {poll && <PollCard messageId={message.id} poll={poll} mine={isCurrentUser} currentUserId={currentUserId} />}
          {event && <EventCard messageId={message.id} event={event} mine={isCurrentUser} currentUserId={currentUserId} otherName={otherName} />}
          {card && <div className="flex justify-end">{meta}</div>}
          {story && (
            <div className={cn(
              "mb-1 flex min-w-[180px] items-stretch overflow-hidden rounded-md border-l-4",
              isCurrentUser ? "bg-black/15 border-white/70" : "bg-black/5 dark:bg-white/5 border-primary",
            )}>
              <div className="min-w-0 flex-1 px-2 py-1.5">
                <p className={cn("text-xs font-semibold", isCurrentUser ? "opacity-90" : "text-primary")}>
                  {isCurrentUser ? `${otherName || "Their"} · Story` : "You · Story"}
                </p>
                <p className="text-[13px] opacity-80">{story.reaction ? "Reacted to the story" : "Replied to the story"}</p>
              </div>
              {story.image && (story.video ? (
                <video src={`${story.image}#t=0.1`} muted playsInline preload="metadata" className="h-14 w-11 shrink-0 object-cover" aria-hidden="true" />
              ) : (
                <img src={story.image} alt="" loading="lazy" className="h-14 w-11 shrink-0 object-cover" />
              ))}
            </div>
          )}
          {/* Sticker */}
          {stickerSrc && (
            <img loading="lazy" decoding="async"
              src={stickerSrc}
              alt={stickerAlt}
              draggable={false}
              className="block h-32 w-32 select-none object-contain drop-shadow-md animate-sticker-pop"
            />
          )}
          {/* Voice */}
          {isVoice && message.image_url && (
            <VoiceMessagePlayer audioUrl={message.image_url} duration={voiceSeconds(message.content)} isOwnMessage={isCurrentUser} />
          )}
          {/* Video */}
          {isVideo && src && (
            <video src={src} controls={!sending} playsInline className="rounded-md max-w-full max-h-64" />
          )}
          {/* GIF */}
          {isGif && message.image_url && (
            <img loading="lazy" decoding="async" src={message.image_url} alt="GIF" className="rounded-md max-w-full max-h-52" />
          )}
          {/* Image */}
          {isMedia && !isVideo && !isGif && src && (
            <img loading="lazy" decoding="async"
              src={src}
              alt="Shared"
              style={box}
              className={cn("block rounded-md max-w-full cursor-pointer bg-black/10 object-cover transition-opacity hover:opacity-90", !box && "min-h-24 min-w-24 max-h-72 max-w-[220px]")}
              onClick={() => { if (!sending && !failed) setViewing(0); }}
            />
          )}
          {isMedia && !isVideo && !isGif && src && (
            <PhotoViewer images={[src]} index={viewing} onIndexChange={setViewing} />
          )}
          {/* On its way: the upload ring over the photo; couldn't go: tap to try again. */}
          {isMedia && (sending || failed) && (
            <div className="pointer-events-none absolute inset-1 flex items-center justify-center rounded-md bg-black/25">
              {failed ? (
                <button type="button" onClick={(e) => { e.stopPropagation(); onRetry?.(message); }}
                  className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-2 text-[13px] font-semibold text-white">
                  <RotateCcw className="h-4 w-4" /> Retry
                </button>
              ) : (
                <UploadRing progress={message._progress} />
              )}
            </div>
          )}
          {once && (
            <ViewOnceBubble messageId={message.id} mine={isCurrentUser} openedAt={message.view_once_opened_at} meta={meta} />
          )}
          {/* Text (time and ticks float at its end, like most messengers) */}
          {once || card ? null : hasText ? (
            <>
              {bigEmoji ? (
                <p className={cn("leading-none", bigEmoji === 1 ? "text-[52px]" : bigEmoji === 2 ? "text-[44px]" : "text-[38px]")}>
                  {message.content.trim()}
                  {meta}
                </p>
              ) : (
              <p className={cn("text-[15px] leading-snug break-words whitespace-pre-wrap", isMedia && "px-2 pt-1 pb-1")}>
                <LinkedText text={story ? story.text : message.content} className={isCurrentUser ? "underline decoration-current/60" : "text-primary underline decoration-primary/40"} />
                {meta}
              </p>
              )}
              {chatLink && !isMedia && <LinkPreview url={chatLink} className="mt-1.5 mb-0.5 max-w-[280px] bg-background/90 text-foreground" />}
            </>
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
