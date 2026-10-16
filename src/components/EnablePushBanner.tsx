import { useEffect, useState } from "react";
import { BellRing, Share, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { enablePush, needsHomeScreenInstall, pushActive, pushConfigured, pushPermission, pushReady, pushSupported } from "@/lib/web-push";

const DISMISS_KEY = "ember_push_banner_dismissed";
const DISMISS_DAYS = 14;

const dismissedRecently = () => {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return !!at && Date.now() - at < DISMISS_DAYS * 864e5;
  } catch {
    return false;
  }
};

/**
 * "Turn on notifications", shown at the top of Messages and Notifications until you do (or
 * close it for a couple of weeks). Browsers only let a tap ask for permission, so this is the
 * tap. On an iPhone in Safari it explains the Home Screen step first.
 */
const EnablePushBanner = () => {
  const { toast } = useToast();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const ios = needsHomeScreenInstall();

  useEffect(() => {
    if (dismissedRecently() || pushActive()) return;
    if (ios) return setShow(pushConfigured);
    let live = true;
    void pushReady().then(() => { if (live) setShow(pushSupported() && pushPermission() === "default"); });
    return () => { live = false; };
  }, [ios]);

  if (!show) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* fine */ }
    setShow(false);
  };

  const turnOn = async () => {
    setBusy(true);
    try {
      const result = await enablePush();
      if (result === "on") setShow(false);
      else if (result === "denied") {
        toast({ title: "Notifications are blocked", description: "Allow them for Ember in your browser or phone settings." });
        setShow(false);
      } else toast({ title: "This browser can't show notifications" });
    } catch {
      toast({ title: "Couldn't turn on notifications", description: "Try again in a moment.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-3 mb-2 flex items-center gap-3 rounded-2xl bg-primary/10 px-3.5 py-3 sm:mx-0 animate-fade-in">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <BellRing className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold leading-tight">Don't miss a message</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
          {ios ? (
            <>Add Ember to your Home Screen (<Share className="inline h-3 w-3 align-[-1px]" aria-label="Share" /> then "Add to Home Screen"), open it from there, and turn notifications on.</>
          ) : (
            "Get alerts even when Ember is closed or your phone is locked."
          )}
        </p>
      </div>
      {!ios && (
        <Button size="sm" className="h-8 shrink-0 rounded-full px-3.5" onClick={turnOn} disabled={busy}>
          Turn on
        </Button>
      )}
      <button type="button" onClick={dismiss} aria-label="Not now" className="-mr-1 shrink-0 rounded-full p-1 text-muted-foreground hover:bg-background/60">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default EnablePushBanner;
