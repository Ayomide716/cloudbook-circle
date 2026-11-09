import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { ActionMenu, ActionMenuContent, ActionMenuItem, ActionMenuSeparator, ActionMenuTrigger } from "@/components/ui/action-menu";
import { CHAT_REACTIONS } from "@/lib/chat-reactions";
import ReactionEmoji from "@/components/reactions/ReactionEmoji";
import { cn } from "@/lib/utils";

export interface MessageAction {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
}

interface MessageActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Your current reaction on the message, if any. */
  myReaction: string | null;
  onReact: (type: string) => void;
  actions: MessageAction[];
  /** Which side of the message the menu lines up with on bigger screens. */
  align?: "start" | "end";
  /** The message's bubble: on phones it's lifted over the dimmed chat, as on WhatsApp. */
  anchorRef?: RefObject<HTMLElement>;
  hideReactions?: boolean;
}

const stop = (e: SyntheticEvent) => e.stopPropagation();
const coarse = () => typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;

const Reactions = ({ myReaction, onPick }: { myReaction: string | null; onPick: (type: string) => void }) => (
  <>
    {CHAT_REACTIONS.map((r, i) => (
      <button
        key={r.type}
        type="button"
        aria-label={r.label}
        aria-pressed={myReaction === r.type}
        title={r.label}
        onClick={() => onPick(r.type)}
        style={{ animationDelay: `${i * 25}ms` }}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full text-[26px] leading-none transition-transform active:scale-90 sm:h-9 sm:w-9 sm:text-xl hover:scale-110",
          "motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:fade-in-0 fill-mode-both duration-200",
          myReaction === r.type && "bg-secondary"
        )}
      >
        <ReactionEmoji type={r.type} className="h-8 w-8 sm:h-7 sm:w-7" />
      </button>
    ))}
  </>
);

/**
 * WhatsApp's press-and-hold: the chat dims and blurs, the message lifts above it with a row of
 * reactions over it and its actions under it (moved up if it's too low for them to fit).
 */
const HoldMenu = ({ anchor, onClose, myReaction, onReact, actions, align, hideReactions }: {
  anchor: HTMLElement; onClose: () => void; myReaction: string | null; onReact: (type: string) => void;
  actions: MessageAction[]; align: "start" | "end"; hideReactions?: boolean;
}) => {
  const copyRef = useRef<HTMLDivElement>(null);
  const [rect] = useState(() => anchor.getBoundingClientRect());
  // The bubble as it is now (photos already loaded), lifted out of the chat.
  useLayoutEffect(() => {
    const holder = copyRef.current;
    if (!holder) return;
    const copy = anchor.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    copy.classList.remove("ring-2");
    copy.style.margin = "0";
    copy.style.maxHeight = "100%";
    copy.style.overflow = "hidden";
    holder.replaceChildren(copy);
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const safeTop = 40;
  const reactH = hideReactions ? 0 : 60;
  const menuH = Math.min(actions.length * 48 + 12, vh * 0.45);
  const height = Math.min(rect.height, vh - safeTop - reactH - menuH - 40);
  const top = Math.max(safeTop + reactH, Math.min(rect.top, vh - 16 - menuH - 8 - height));
  const side = align === "end" ? { right: Math.max(8, vw - rect.right) } : { left: Math.max(8, rect.left) };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Message options" data-state="open" className="fixed inset-0 z-[120]"
      onClick={stop} onPointerDown={stop} onTouchStart={stop} onContextMenu={(e) => { e.preventDefault(); stop(e); }}>
      <button type="button" aria-label="Close" onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/35 backdrop-blur-[6px] animate-in fade-in-0 duration-150" />
      {!hideReactions && (
        <div role="group" aria-label="React" style={{ ...side, top: top - reactH }}
          className="absolute flex gap-0.5 rounded-full bg-popover p-1 shadow-xl animate-in fade-in-0 zoom-in-90 duration-150">
          <Reactions myReaction={myReaction} onPick={(t) => { onReact(t); onClose(); }} />
        </div>
      )}
      <div ref={copyRef} aria-hidden="true" style={{ ...side, top, width: rect.width, height }}
        className="pointer-events-none absolute transition-[top] duration-200 [&>*]:shadow-lg" />
      <div role="menu" style={{ ...side, top: top + height + 8, maxHeight: menuH }}
        className="absolute w-56 overflow-y-auto rounded-2xl bg-popover py-1.5 text-popover-foreground shadow-xl animate-in fade-in-0 slide-in-from-top-2 duration-150">
        {actions.map((a) => (
          <button key={a.label} type="button" role="menuitem" onClick={() => { onClose(); a.onSelect(); }}
            className={cn("flex h-12 w-full items-center px-4 text-left text-[15px] active:bg-accent [&_svg]:ml-auto [&_svg]:order-last [&_svg]:mr-0", a.destructive && "text-destructive")}>
            {a.icon}
            {a.label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
};

/**
 * WhatsApp's message menu: press and hold a message for a row of reactions and its actions
 * (reply, copy, edit, delete). On phones the message lifts over the dimmed chat (HoldMenu); on
 * computers it's a menu by the message. Put it inside the message's (relatively positioned)
 * bubble so the menu lines up with it.
 */
const MessageActionSheet = ({ open, onOpenChange, myReaction, onReact, actions, align = "start", anchorRef, hideReactions }: MessageActionSheetProps) => {
  if (open && anchorRef?.current && coarse()) {
    return (
      <HoldMenu anchor={anchorRef.current} onClose={() => onOpenChange(false)} myReaction={myReaction} onReact={onReact}
        actions={actions} align={align} hideReactions={hideReactions} />
    );
  }
  return (
    // The sheet is portalled, but React still passes its taps and touches up to the message:
    // keep them here, so they don't start a press-and-hold or a swipe on it.
    <span
      className="contents"
      onClick={stop}
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      onTouchStart={stop}
      onTouchMove={stop}
      onTouchEnd={stop}
      onContextMenu={stop}
    >
    <ActionMenu open={open} onOpenChange={onOpenChange}>
      <ActionMenuTrigger asChild>
        <span aria-hidden="true" tabIndex={-1} className="pointer-events-none absolute inset-0" />
      </ActionMenuTrigger>
      <ActionMenuContent align={align} title="Message options" className="w-60">
        {!hideReactions && (
          <>
            <div role="group" aria-label="React" className="mx-auto mb-1 flex w-full max-w-sm justify-between gap-0.5 rounded-full bg-secondary/70 p-1">
              <Reactions myReaction={myReaction} onPick={(t) => { onReact(t); onOpenChange(false); }} />
            </div>
            <ActionMenuSeparator />
          </>
        )}
        {actions.map((a) => (
          <ActionMenuItem key={a.label} onClick={a.onSelect} className={cn(a.destructive && "text-destructive focus:text-destructive")}>
            {a.icon}
            {a.label}
          </ActionMenuItem>
        ))}
      </ActionMenuContent>
    </ActionMenu>
    </span>
  );
};

export default MessageActionSheet;
