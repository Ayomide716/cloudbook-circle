import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCheck, Check, Pin, X } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/components/ChatBubble";

/** WhatsApp's delete: for everyone (your own messages) or just for you. */
export const DeleteMessageDialog = ({ message, mine, onClose, onForEveryone, onForMe }: {
  message: ChatMessage | null; mine: boolean; onClose: () => void; onForEveryone: () => void; onForMe: () => void;
}) => (
  <Dialog open={!!message} onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader><DialogTitle>Delete message?</DialogTitle></DialogHeader>
      <div className="flex flex-col gap-1">
        {mine && (
          <button type="button" onClick={() => { onForEveryone(); onClose(); }} className="h-12 rounded-xl px-3 text-left font-semibold text-destructive hover:bg-accent">
            Delete for everyone
          </button>
        )}
        <button type="button" onClick={() => { onForMe(); onClose(); }} className="h-12 rounded-xl px-3 text-left font-semibold text-destructive hover:bg-accent">
          Delete for me
        </button>
        <button type="button" onClick={onClose} className="h-12 rounded-xl px-3 text-left font-semibold hover:bg-accent">Cancel</button>
      </div>
    </DialogContent>
  </Dialog>
);

const stamp = (iso?: string | null) => (iso ? format(new Date(iso), "d MMM yyyy, HH:mm") : "—");

/** Message info: when your message was delivered and read. */
export const MessageInfoDialog = ({ message, showRead, onClose }: { message: ChatMessage | null; showRead: boolean; onClose: () => void }) => (
  <Dialog open={!!message} onOpenChange={(o) => { if (!o) onClose(); }}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader><DialogTitle>Message info</DialogTitle></DialogHeader>
      {message && (
        <div className="space-y-4">
          <p className="line-clamp-4 rounded-xl bg-chat-sent px-3 py-2 text-[15px] text-primary-foreground dark:text-white">
            {message.content}
          </p>
          <div className="divide-y rounded-xl border">
            <div className="flex items-center gap-3 p-3">
              <CheckCheck className={cn("h-5 w-5", showRead && message.read ? "text-sky-500" : "text-muted-foreground")} />
              <div>
                <p className="font-medium">Read</p>
                <p className="text-sm text-muted-foreground">{!showRead ? "Read receipts are off" : message.read ? (message.read_at ? stamp(message.read_at) : "Yes") : "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3">
              <CheckCheck className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Delivered</p>
                <p className="text-sm text-muted-foreground">{stamp(message.delivered_at)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3">
              <Check className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Sent</p>
                <p className="text-sm text-muted-foreground">{stamp(message.created_at)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </DialogContent>
  </Dialog>
);

/** The pinned messages bar under the chat's header: tap to go to it (and on to the next). */
export const PinnedBar = ({ pins, index, preview, onOpen, onUnpin }: {
  pins: string[]; index: number; preview: string; onOpen: () => void; onUnpin: () => void;
}) => (
  <div className="flex flex-shrink-0 items-center gap-2 border-b bg-card px-3 py-1.5">
    {pins.length > 1 && (
      <span className="flex h-8 flex-col justify-center gap-0.5" aria-hidden="true">
        {pins.map((p, i) => <span key={p} className={cn("w-[3px] flex-1 rounded-full", i === index ? "bg-primary" : "bg-muted-foreground/30")} />)}
      </span>
    )}
    <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-label={`Pinned message: ${preview}. Go to it`}>
      <Pin className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-primary">Pinned message{pins.length > 1 ? ` ${index + 1} of ${pins.length}` : ""}</span>
        <span className="block truncate text-[13px] text-muted-foreground">{preview}</span>
      </span>
    </button>
    <button type="button" onClick={onUnpin} aria-label="Unpin" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent">
      <X className="h-4 w-4" />
    </button>
  </div>
);
