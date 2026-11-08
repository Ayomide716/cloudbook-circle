import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause } from "@/components/icons";
import { cn } from "@/lib/utils";
import { fallbackPeaks, loadPeaks } from "@/lib/waveform";

interface VoiceMessagePlayerProps {
  audioUrl: string;
  /** Seconds, if known (recordings in some browsers don't report their own length). */
  duration?: number;
  isOwnMessage?: boolean;
}

const BARS = 34;
const HEARD_KEY = "ember:voice-heard";
const hasHeard = (url: string) => {
  try { return (JSON.parse(localStorage.getItem(HEARD_KEY) || "[]") as string[]).includes(url); } catch { return false; }
};
const rememberHeard = (url: string) => {
  try {
    const list = (JSON.parse(localStorage.getItem(HEARD_KEY) || "[]") as string[]).filter((u) => u !== url);
    localStorage.setItem(HEARD_KEY, JSON.stringify([url, ...list].slice(0, 300)));
  } catch { /* not remembered */ }
};
const SPEEDS = [1, 1.5, 2] as const;

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

/**
 * A voice note: a round play button, the recording's waveform filling in as it plays (tap or drag
 * along it to jump), the time, a dot until you've played someone else's note, and a 1× / 1.5× / 2×
 * speed button once it's playing.
 */
const VoiceMessagePlayer = ({ audioUrl, duration, isOwnMessage }: VoiceMessagePlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [peaks, setPeaks] = useState<number[]>(() => fallbackPeaks(audioUrl, BARS));
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [scrubbing, setScrubbing] = useState(false);
  // Whether you've played it (remembered on this phone), for the "not played yet" dot.
  const [heard, setHeard] = useState(() => hasHeard(audioUrl));
  const markHeard = () => { if (!heard) { setHeard(true); rememberHeard(audioUrl); } };

  // The real shape of the recording, once it's downloaded (the placeholder shows until then).
  useEffect(() => {
    let cancelled = false;
    loadPeaks(audioUrl, BARS).then((result) => {
      if (cancelled || !result) return;
      setPeaks(result.peaks);
      if (!duration && result.duration) setAudioDuration((d) => (Number.isFinite(d) && d > 0 ? d : result.duration));
    });
    return () => { cancelled = true; };
  }, [audioUrl, duration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => {
      if (!duration && Number.isFinite(audio.duration) && audio.duration > 0) setAudioDuration(audio.duration);
    };
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    const onPause = () => setIsPlaying(false);
    const onPlay = () => setIsPlaying(true);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
    };
  }, [duration]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.playbackRate = speed;
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  };

  /** Jumps to the point of the waveform under the finger or pointer. */
  const seekTo = useCallback((clientX: number) => {
    const audio = audioRef.current;
    const wave = waveRef.current;
    if (!audio || !wave || !audioDuration) return;
    const rect = wave.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const time = ratio * audioDuration;
    try { audio.currentTime = time; } catch { /* not seekable yet */ }
    setCurrentTime(time);
  }, [audioDuration]);

  const progress = audioDuration > 0 ? Math.min(1, currentTime / audioDuration) : 0;
  const started = isPlaying || currentTime > 0;
  const showTime = started ? currentTime : audioDuration;

  // The waveform's bars; drawn twice (faint, then full colour clipped to how far it's played)
  // so the colour fills smoothly instead of one bar at a time.
  const bars = (tone: string) => peaks.map((peak, i) => (
    <span key={i} className={cn("w-[2.5px] shrink-0 rounded-full", tone)} style={{ height: `${Math.max(14, Math.round(peak * 100))}%` }} />
  ));

  return (
    <div className="flex min-w-[232px] items-center gap-2.5 py-1">
      <audio ref={audioRef} src={audioUrl} preload="metadata" className="hidden" />

      <button
        type="button"
        onClick={() => { markHeard(); togglePlayback(); }}
        aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
        className={cn(
          "relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full shadow-sm transition-transform active:scale-95",
          isOwnMessage ? "bg-white text-primary" : "bg-primary text-primary-foreground"
        )}
      >
        {/* A soft ring breathes while it plays. */}
        {isPlaying && <span className={cn("absolute inset-0 rounded-full motion-safe:animate-ping opacity-30", isOwnMessage ? "bg-white" : "bg-primary")} aria-hidden="true" />}
        {isPlaying ? <Pause className="relative h-5 w-5 fill-current" /> : <Play className="relative ml-0.5 h-5 w-5 fill-current" />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          ref={waveRef}
          role="slider"
          tabIndex={0}
          aria-label="Voice message position"
          aria-valuemin={0}
          aria-valuemax={Math.round(audioDuration)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(audioDuration)}`}
          className="relative h-8 cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          // Keep the drag from also swiping the message (swipe to reply).
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            setScrubbing(true);
            markHeard();
            seekTo(e.clientX);
          }}
          onPointerMove={(e) => { if (scrubbing) seekTo(e.clientX); }}
          onPointerUp={() => setScrubbing(false)}
          onPointerCancel={() => setScrubbing(false)}
          onKeyDown={(e) => {
            const audio = audioRef.current;
            if (!audio || !audioDuration) return;
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              const time = Math.min(audioDuration, Math.max(0, audio.currentTime + (e.key === "ArrowRight" ? 5 : -5)));
              audio.currentTime = time;
              setCurrentTime(time);
            }
          }}
        >
          <div className="absolute inset-0 flex items-center justify-between" aria-hidden="true">
            {bars(isOwnMessage ? "bg-white/35" : "bg-foreground/20")}
          </div>
          <div
            className="absolute inset-0 flex items-center justify-between"
            style={{ clipPath: `inset(0 ${100 - progress * 100}% 0 0)`, transition: scrubbing || !isPlaying ? "none" : "clip-path 0.25s linear" }}
            aria-hidden="true"
          >
            {bars(isOwnMessage ? "bg-white" : "bg-primary")}
          </div>
        </div>
        <div className="flex h-[18px] items-center gap-1.5">
          <span className={cn("text-[11px] font-medium tabular-nums", isOwnMessage ? "text-white/80" : "text-muted-foreground")}>
            {formatTime(showTime)}
          </span>
          {/* Not listened to yet (someone else's), as on WhatsApp. */}
          {!isOwnMessage && !heard && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="Not played yet" />}
          {started && (
            <button
              type="button"
              onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
              aria-label={`Playback speed ${speed} times`}
              className={cn(
                "ml-auto rounded-full px-2 text-[11px] font-bold leading-[18px] animate-in fade-in-0 zoom-in-95",
                isOwnMessage ? "bg-white/25 text-white" : "bg-foreground/10 text-foreground"
              )}
            >
              {speed}×
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VoiceMessagePlayer;
