import { useEffect, useRef, useState } from "react";
import { Maximize, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeedVideoProps {
  src: string;
  /** Double tap, as on Instagram: likes the post. */
  onDoubleTap?: () => void;
  className?: string;
}

const DOUBLE_TAP_MS = 280;

const time = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
};

/**
 * A video in a post. Tap to play or pause, double-tap to like (the phone's own controls would
 * use a double tap to skip 10 seconds), and a bar to scrub, mute or go full screen.
 */
const FeedVideo = ({ src, onDoubleTap, className }: FeedVideoProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const tapTimer = useRef<number>();
  const lastTap = useRef(0);
  const hideTimer = useRef<number>();
  const [playing, setPlaying] = useState(false);
  // Starts muted so it can play by itself as you scroll (phones only allow that silently).
  const [muted, setMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  // Once you pause it yourself, scrolling doesn't start it again.
  const userPaused = useRef(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showBar, setShowBar] = useState(true);

  useEffect(() => () => { window.clearTimeout(tapTimer.current); window.clearTimeout(hideTimer.current); }, []);

  // Plays (muted) while mostly on screen and pauses when scrolled away, as on Facebook and
  // Instagram. Not on data saver, and not for people who prefer less motion.
  useEffect(() => {
    const el = containerRef.current;
    const v = videoRef.current;
    if (!el || !v) return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const lessMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (saveData || lessMotion || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          if (!userPaused.current && v.paused) void v.play().catch(() => {});
        } else if (!v.paused) {
          v.pause();
        }
      },
      { threshold: [0, 0.6, 1] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pokeBar = () => {
    setShowBar(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => { if (!videoRef.current?.paused) setShowBar(false); }, 2500);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { userPaused.current = false; void v.play().catch(() => {}); }
    else { userPaused.current = true; v.pause(); }
    pokeBar();
  };

  /** A tap: turns the sound on for a video playing by itself, otherwise plays or pauses. */
  const tapAction = () => {
    const v = videoRef.current;
    if (v && !v.paused && muted) { setMuted(false); pokeBar(); return; }
    togglePlay();
  };

  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      window.clearTimeout(tapTimer.current);
      lastTap.current = 0;
      onDoubleTap?.();
      return;
    }
    lastTap.current = now;
    window.clearTimeout(tapTimer.current);
    tapTimer.current = window.setTimeout(tapAction, DOUBLE_TAP_MS);
  };

  const fullscreen = () => {
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!v) return;
    if (v.requestFullscreen) void v.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    else v.webkitEnterFullscreen?.();
  };

  return (
    <div ref={containerRef} className={cn("relative select-none bg-black", className)}>
      <video
        ref={videoRef}
        // "#t=0.1" makes phones (iOS especially) show the first frame instead of a black box.
        src={src.includes("#") ? src : `${src}#t=0.1`}
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
        muted={muted}
        onPlay={() => { setPlaying(true); pokeBar(); }}
        onPause={() => { setPlaying(false); setShowBar(true); }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onEnded={() => setShowBar(true)}
        className="block max-h-[600px] w-full object-contain"
        style={{ aspectRatio: "16/9" }}
      />

      {/* The whole picture is the tap target (play / pause, or like on a double tap). */}
      <button
        type="button"
        aria-label={playing ? (muted ? "Turn sound on" : "Pause video") : "Play video"}
        className="absolute inset-0 flex items-center justify-center"
        onClick={onTap}
        onDoubleClick={(e) => e.preventDefault()}
      >
        {!playing && (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            <Play className="ml-1 h-8 w-8 fill-white" />
          </span>
        )}
      </button>

      {/* Playing silently: a sound-off badge, tap the video for sound. */}
      {playing && muted && !showBar && (
        <span className="pointer-events-none absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white" aria-hidden="true">
          <VolumeX className="h-4 w-4" />
        </span>
      )}

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6 text-white transition-opacity duration-200",
          showBar ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <button type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className="flex h-8 w-8 items-center justify-center rounded-full">
          {playing ? <Pause className="h-4 w-4 fill-white" /> : <Play className="h-4 w-4 fill-white" />}
        </button>
        <span className="text-[11px] tabular-nums">{time(current)}</span>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(current, duration || 0)}
          aria-label="Video position"
          onChange={(e) => {
            const v = videoRef.current;
            if (v) v.currentTime = Number(e.target.value);
            setCurrent(Number(e.target.value));
            pokeBar();
          }}
          className="h-1 min-w-0 flex-1 cursor-pointer accent-white"
        />
        <span className="text-[11px] tabular-nums">{time(duration)}</span>
        <button type="button" onClick={() => { setMuted((m) => !m); pokeBar(); }} aria-label={muted ? "Unmute" : "Mute"} className="flex h-8 w-8 items-center justify-center rounded-full">
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <button type="button" onClick={fullscreen} aria-label="Full screen" className="flex h-8 w-8 items-center justify-center rounded-full">
          <Maximize className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default FeedVideo;
