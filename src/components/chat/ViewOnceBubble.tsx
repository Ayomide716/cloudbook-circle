import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { X, Loader2 } from "@/components/icons";
import DarkStatusBar from "@/components/DarkStatusBar";
import { setScreenSecure } from "@/lib/native/ember-window";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ViewOnceBubbleProps {
  messageId: string;
  mine: boolean;
  openedAt: string | null | undefined;
  /** Time and ticks, as on every bubble. */
  meta: React.ReactNode;
  onOpened?: () => void;
}

/** The round "1" that marks a view-once photo. */
const OnceMark = ({ dashed }: { dashed?: boolean }) => (
  <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-current text-[11px] font-bold", dashed && "border-dashed opacity-70")} aria-hidden="true">1</span>
);

/**
 * A view-once photo, as on WhatsApp: "Photo" until they open it, then "Opened". The receiver
 * taps to see it full screen once (no saving, no screenshots in the app); closing it is final.
 */
const ViewOnceBubble = ({ messageId, mine, openedAt, meta, onOpened }: ViewOnceBubbleProps) => {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(!!openedAt);
  useEffect(() => { if (openedAt) setOpened(true); }, [openedAt]);

  // No screenshots while it's open (in the app).
  useEffect(() => {
    if (!url) return;
    setScreenSecure(true);
    return () => setScreenSecure(false);
  }, [url]);

  const open = async () => {
    if (mine || opened || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("open_view_once", { _message: messageId });
    setBusy(false);
    setOpened(true);
    onOpened?.();
    if (error || !data) {
      toast({ title: "This photo can't be opened", description: "It was already opened." });
      return;
    }
    setUrl(data);
  };

  const label = mine ? (opened ? "Opened" : "Photo") : opened ? "Opened" : "Photo";
  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={mine || opened}
        aria-label={mine ? `View-once photo, ${opened ? "opened" : "not opened yet"}` : opened ? "View-once photo, opened" : "View-once photo. Tap to view"}
        className="flex min-w-[150px] items-center gap-2.5 px-1 py-1 text-left disabled:cursor-default"
      >
        {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <OnceMark dashed={opened} />}
        <span className="flex-1">
          <span className={cn("block text-[15px] font-semibold", opened && "font-normal italic opacity-80")}>{label}</span>
          {!mine && !opened && <span className="block text-xs opacity-75">Tap to view once</span>}
        </span>
        {meta}
      </button>

      {url && createPortal(
        <div className="fixed inset-0 z-[120] flex flex-col bg-black text-white animate-in fade-in-0 duration-200" role="dialog" aria-label="View-once photo" data-no-peek="">
          <DarkStatusBar />
          <div className="flex items-center justify-between px-2 pt-[calc(env(safe-area-inset-top)+0.25rem)]">
            <button type="button" onClick={() => setUrl(null)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close">
              <X className="h-6 w-6" />
            </button>
            <span className="flex items-center gap-2 pr-3 text-sm font-medium text-white/80"><OnceMark /> View once</span>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-2" onContextMenu={(e) => e.preventDefault()}>
            <img src={url} alt="View-once photo" draggable={false} className="max-h-full max-w-full select-none object-contain" />
          </div>
          <p className="pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-white/60">Once you close this photo, it's gone.</p>
        </div>,
        document.body,
      )}
    </>
  );
};

export default ViewOnceBubble;
