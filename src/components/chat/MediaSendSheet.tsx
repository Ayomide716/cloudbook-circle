import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Send, X } from "@/components/icons";
import DarkStatusBar from "@/components/DarkStatusBar";
import { features } from "@/lib/features";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

interface MediaSendSheetProps {
  files: File[];
  /** To whom (shown at the bottom, as on WhatsApp). */
  toName: string;
  onCancel: () => void;
  onSend: (files: File[], caption: string, viewOnce: boolean) => void;
}

/**
 * Photos picked to send, full screen, as on WhatsApp: the photo big, the others as thumbnails
 * (tap to look, × to drop), a caption, view once (one photo), and send.
 */
const MediaSendSheet = ({ files, toName, onCancel, onSend }: MediaSendSheetProps) => {
  const [list, setList] = useState(files);
  const [current, setCurrent] = useState(0);
  const [caption, setCaption] = useState("");
  const [once, setOnce] = useState(false);
  const urls = useMemo(() => list.map((f) => URL.createObjectURL(f)), [list]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  useEffect(() => { if (current >= list.length) setCurrent(Math.max(0, list.length - 1)); }, [list, current]);
  useEffect(() => { if (list.length === 0) onCancel(); }, [list, onCancel]);
  const canOnce = features.viewOnce && list.length === 1;
  // Android's back button (sent as Escape) closes this, not the chat behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onCancel(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return createPortal(
    <div className="fixed inset-x-0 top-0 bottom-[var(--keyboard-inset,0px)] z-[130] flex flex-col bg-black text-white animate-in fade-in-0 duration-200" role="dialog" data-state="open" aria-label="Send photos">
      <DarkStatusBar />
      <div className="flex items-center justify-between px-2 pt-[calc(env(safe-area-inset-top)+0.25rem)]">
        <button type="button" onClick={onCancel} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Cancel">
          <X className="h-6 w-6" />
        </button>
        {list.length > 1 && <span className="text-sm text-white/70">{current + 1} of {list.length}</span>}
        <span className="w-11" />
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-2">
        {urls[current] && <img src={urls[current]} alt={`Photo ${current + 1}`} className="max-h-full max-w-full object-contain" />}
      </div>

      {/* Thumbnails, and + to add more (up to 10). */}
      {(list.length > 1 || list.length < 10) && (
        <div className="flex gap-2 overflow-x-auto px-3 pb-2" data-no-tab-swipe="">
          {urls.map((u, i) => (
            <div key={u} className="relative shrink-0">
              <button type="button" onClick={() => setCurrent(i)} aria-label={`Photo ${i + 1}`}
                className={cn("block h-14 w-14 overflow-hidden rounded-lg ring-2", i === current ? "ring-white" : "ring-transparent opacity-70")}>
                <img src={u} alt="" className="h-full w-full object-cover" />
              </button>
              {list.length > 1 && (
                <button type="button" onClick={() => setList((l) => l.filter((_, j) => j !== i))} aria-label={`Remove photo ${i + 1}`}
                  className="tap-target absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 ring-1 ring-white/40">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {list.length < 10 && (
            <label className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/40" aria-label="Add more photos">
              <Plus className="h-5 w-5" />
              <input type="file" accept="image/*" multiple hidden onChange={(e) => { const f = Array.from(e.target.files ?? []); e.target.value = ""; if (f.length) setList((l) => [...l, ...f].slice(0, 10)); }} />
            </label>
          )}
        </div>
      )}

      {/* Caption, view once and send. */}
      <div className="flex items-end gap-2 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1">
        <div className="flex min-h-12 flex-1 items-center gap-1 rounded-3xl bg-white/10 px-4">
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Add a caption…" aria-label="Caption"
            className="h-12 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-white/50" />
          {canOnce && (
            <button type="button" onClick={() => { setOnce((o) => !o); haptic(8); }} aria-pressed={once} aria-label={once ? "View once on" : "View once off"} title="View once"
              className={cn("-mr-2 flex h-10 w-10 items-center justify-center rounded-full", once && "bg-white text-black")}>
              <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2 border-current text-[11px] font-bold", !once && "border-dashed")}>1</span>
            </button>
          )}
        </div>
        <button type="button" onClick={() => onSend(list, caption.trim(), canOnce && once)} aria-label={`Send to ${toName}`}
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Send className="h-5 w-5 translate-x-px" />
          {list.length > 1 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold text-black">{list.length}</span>}
        </button>
      </div>
      {once && <p className="pb-2 text-center text-xs text-white/70">View once: {toName} can open it one time</p>}
    </div>,
    document.body,
  );
};

export default MediaSendSheet;
