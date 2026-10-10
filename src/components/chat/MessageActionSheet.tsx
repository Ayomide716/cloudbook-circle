import type { ReactNode, SyntheticEvent } from "react";
import { ActionMenu, ActionMenuContent, ActionMenuItem, ActionMenuSeparator, ActionMenuTrigger } from "@/components/ui/action-menu";
import { CHAT_REACTIONS } from "@/lib/chat-reactions";
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
}

const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * WhatsApp's message menu: press and hold a message for a row of reactions and its actions
 * (reply, copy, edit, delete). A bottom sheet on phones, a menu by the message on computers.
 * Put it inside the message's (relatively positioned) bubble so the menu lines up with it.
 */
const MessageActionSheet = ({ open, onOpenChange, myReaction, onReact, actions, align = "start" }: MessageActionSheetProps) => (
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
      <div role="group" aria-label="React" className="mx-auto mb-1 flex w-full max-w-sm justify-between gap-0.5 rounded-full bg-secondary/70 p-1">
        {CHAT_REACTIONS.map((r) => (
          <button
            key={r.type}
            type="button"
            aria-label={r.label}
            aria-pressed={myReaction === r.type}
            title={r.label}
            onClick={() => { onReact(r.type); onOpenChange(false); }}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full text-[26px] leading-none transition-transform active:scale-90 sm:h-9 sm:w-9 sm:text-xl hover:scale-110",
              myReaction === r.type && "bg-background shadow-sm"
            )}
          >
            {r.emoji}
          </button>
        ))}
      </div>
      <ActionMenuSeparator />
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

export default MessageActionSheet;
