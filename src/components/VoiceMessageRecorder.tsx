import { uploadMedia } from "@/lib/media-upload";
import { useState, useRef, useEffect, type PointerEvent as ReactPointerEvent } from "react";
import { Mic, Loader2, Lock, Pause, Send, Trash2, ChevronUp, ChevronLeft } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { cn, friendlyError } from "@/lib/utils";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { haptic } from "@/lib/haptics";

interface VoiceMessageRecorderProps {
  /** Uploaded and ready (used when the chat doesn't take the file itself, see onRecorded). */
  onVoiceMessageSent: (audioUrl: string, duration: number) => void;
  /** The recording, for the chat to show at once and upload itself (as a photo is). */
  onRecorded?: (file: File, duration: number) => void;
  disabled?: boolean;
  /** Told when recording starts or ends, so the composer can give the recorder the whole row. */
  onActiveChange?: (active: boolean) => void;
  /** Classes for the round mic button. */
  buttonClassName?: string;
}

const CANCEL_AT = 110; // px to the left
const LOCK_AT = 80; // px up

const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;

/**
 * Voice notes as on WhatsApp: hold the mic to record and let go to send. Slide left to cancel,
 * or slide up to lock and record hands-free (then pause, delete or send). A quick tap only says
 * how it works.
 */
const VoiceMessageRecorder = ({ onVoiceMessageSent, onRecorded, disabled, onActiveChange, buttonClassName }: VoiceMessageRecorderProps) => {
  const notifyActive = useEffectEvent((active: boolean) => onActiveChange?.(active));
  const { toast } = useToast();
  // idle → holding (finger down) → locked (hands-free); sending while it uploads.
  const [phase, setPhase] = useState<"idle" | "holding" | "locked" | "sending">("idle");
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [hint, setHint] = useState(false);
  const active = phase === "holding" || phase === "locked";
  useEffect(() => { notifyActive(active); }, [active, notifyActive]);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const start = useRef<{ x: number; y: number; at: number } | null>(null);
  // What to do once the recorder has stopped: send it, or throw it away.
  const onStop = useRef<"send" | "discard">("discard");
  const lockedAt = useRef(0);
  const secondsRef = useRef(0);
  secondsRef.current = seconds;

  const cleanup = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
  };
  useEffect(() => () => { onStop.current = "discard"; try { recorder.current?.stop(); } catch { /* stopped */ } cleanup(); }, []);

  const deliver = async (blob: Blob, duration: number) => {
    const type = blob.type || "audio/webm";
    const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    const fileName = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const file = new File([blob], fileName, { type });
    if (onRecorded) { onRecorded(file, duration); setPhase("idle"); return; }
    setPhase("sending");
    try {
      onVoiceMessageSent(await uploadMedia("voice-messages", fileName, file), duration);
    } catch (error) {
      toast({ title: "Couldn't send the voice message", description: friendlyError(error), variant: "destructive" });
    } finally {
      setPhase("idle");
    }
  };

  const begin = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Let go while the phone was still asking for the microphone: don't start.
      if (!start.current) { media.getTracks().forEach((t) => t.stop()); return; }
      stream.current = media;
      const rec = new MediaRecorder(media);
      recorder.current = rec;
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        const duration = Math.max(1, secondsRef.current);
        cleanup();
        if (onStop.current === "send" && blob.size > 0) void deliver(blob, duration);
        else setPhase("idle");
      };
      rec.start(250);
      setSeconds(0);
      setPaused(false);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      haptic(15);
    } catch {
      setPhase("idle");
      start.current = null;
      toast({ title: "Ember needs your microphone", description: "Allow it in your phone's settings to record voice messages.", variant: "destructive" });
    }
  };

  const finish = (how: "send" | "discard") => {
    onStop.current = how;
    start.current = null;
    setDrag({ x: 0, y: 0 });
    const rec = recorder.current;
    if (rec && rec.state !== "inactive") rec.stop();
    else { cleanup(); setPhase("idle"); }
    if (how === "discard") { haptic(10); setPhase("idle"); }
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled || phase === "sending") return;
    if (phase === "locked") return; // the button is "send" now (onClick)
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, at: Date.now() };
    setDrag({ x: 0, y: 0 });
    setPhase("holding");
    void begin();
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (phase !== "holding" || !start.current) return;
    const x = Math.min(0, e.clientX - start.current.x);
    const y = Math.min(0, e.clientY - start.current.y);
    // Mostly one way or the other, as WhatsApp does.
    const next = Math.abs(x) > Math.abs(y) ? { x, y: 0 } : { x: 0, y };
    setDrag(next);
    if (-next.x > CANCEL_AT) finish("discard");
    else if (-next.y > LOCK_AT) { haptic(12); lockedAt.current = Date.now(); setDrag({ x: 0, y: 0 }); setPhase("locked"); }
  };
  const onPointerUp = () => {
    if (phase !== "holding" || !start.current) return;
    const held = Date.now() - start.current.at;
    // A quick tap: say how it works instead of sending a blip.
    if (held < 450 || secondsRef.current < 1) {
      finish("discard");
      setHint(true);
      window.setTimeout(() => setHint(false), 1800);
      return;
    }
    finish("send");
  };
  const onPointerCancel = () => { if (phase === "holding") finish("discard"); };

  const togglePause = () => {
    const rec = recorder.current;
    if (!rec) return;
    if (rec.state === "recording") {
      rec.pause();
      if (timer.current) clearInterval(timer.current);
      setPaused(true);
    } else if (rec.state === "paused") {
      rec.resume();
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      setPaused(false);
    }
  };

  const cancelProgress = Math.min(1, -drag.x / CANCEL_AT);
  return (
    <>
      {active && (
        <div key="row" className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-3xl bg-chat-surface px-3 shadow-sm" aria-live="polite">
          {phase === "locked" ? (
            <button type="button" onClick={() => finish("discard")} aria-label="Delete recording"
              className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent">
              <Trash2 className="h-[22px] w-[22px]" />
            </button>
          ) : null}
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full bg-destructive", !paused && "animate-pulse")} aria-hidden="true" />
          <span className="shrink-0 text-[15px] tabular-nums">{formatDuration(seconds)}</span>
          {phase === "holding" ? (
            <span className="flex flex-1 items-center justify-center gap-1 overflow-hidden text-sm text-muted-foreground"
              style={{ transform: `translateX(${drag.x * 0.6}px)`, opacity: 1 - cancelProgress * 0.8 }}>
              <ChevronLeft className="h-4 w-4 animate-pulse" /> Slide to cancel
            </span>
          ) : (
            <span className="flex-1 text-sm text-muted-foreground">{paused ? "Paused" : "Recording…"}</span>
          )}
          {phase === "locked" && (
            <button type="button" onClick={togglePause} aria-label={paused ? "Carry on recording" : "Pause recording"}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-destructive hover:bg-accent">
              {paused ? <Mic className="h-[22px] w-[22px]" /> : <Pause className="h-[22px] w-[22px]" />}
            </button>
          )}
        </div>
      )}
      <div key="mic" className="relative shrink-0">
        {/* Slide up to lock: shown above the mic while holding. */}
        {phase === "holding" && (
          <div aria-hidden="true" className="absolute bottom-full left-1/2 mb-3 flex -translate-x-1/2 flex-col items-center gap-1 rounded-full bg-chat-surface px-2 py-3 text-muted-foreground shadow-md animate-in fade-in-0 slide-in-from-bottom-2"
            style={{ transform: `translate(-50%, ${Math.max(drag.y, -LOCK_AT) * 0.5}px)` }}>
            <Lock className="h-5 w-5" />
            <ChevronUp className="h-4 w-4 animate-bounce" />
          </div>
        )}
        {hint && (
          <div role="status" className="absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-lg bg-foreground px-3 py-1.5 text-[13px] text-background shadow-lg animate-in fade-in-0">
            Hold to record, release to send
          </div>
        )}
        <button
          type="button"
          disabled={disabled || phase === "sending"}
          aria-label={phase === "locked" ? "Send voice message" : "Record voice message (hold)"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          // (Not the click that ends the slide up that locked it.)
          onClick={phase === "locked" ? () => { if (Date.now() - lockedAt.current > 500) finish("send"); } : undefined}
          onContextMenu={(e) => e.preventDefault()}
          // Keyboard: Enter / Space start a hands-free recording.
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && phase === "idle") { e.preventDefault(); start.current = { x: 0, y: 0, at: Date.now() }; setPhase("locked"); void begin(); } }}
          style={phase === "holding" ? { transform: `translate(${drag.x}px, ${drag.y}px) scale(1.45)` } : undefined}
          className={cn(
            buttonClassName ?? "h-10 w-10 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary",
            "flex touch-none select-none items-center justify-center transition-transform duration-150 [-webkit-touch-callout:none]",
            phase === "holding" && "duration-0 shadow-lg",
          )}
        >
          {phase === "sending" ? <Loader2 className="animate-spin" /> : phase === "locked" ? <Send className="translate-x-px" /> : <Mic />}
        </button>
      </div>
    </>
  );
};

export default VoiceMessageRecorder;
