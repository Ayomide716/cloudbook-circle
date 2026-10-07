import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";
import { fallbackPeaks, loadPeaks } from "@/lib/waveform";

interface VoiceMessagePlayerProps {
  audioUrl: string;
  /** Seconds, if known (recordings in some browsers don't report their own length). */
  duration?: number;
  isOwnMessage?: boolean;
}

const BARS = 36;
const SPEEDS = [1, 1.5, 2] as const;

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

/**
 * A voice note as WhatsApp shows it: play/pause, the recording's waveform (tap or drag along it
 * to jump back or forward), the time, and a 1× / 1.5× / 2× speed button.
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
  const showTime = isPlaying || currentTime > 0 ? currentTime : audioDuration;

  return (
    <div className="flex min-w-[220px] items-center gap-2 py-0.5">
      <audio ref={audioRef} src={audioUrl} preload="metadata" className="hidden" />

      <button
        type="button"
        onClick={togglePlayback}
        aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
        className={cn(
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors",
          isOwnMessage ? "bg-white/20 hover:bg-white/30" : "bg-foreground/10 hover:bg-foreground/20"
        )}
      >
        {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
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
          className="relative flex h-8 cursor-pointer touch-none items-center gap-[2px] outline-none"
          // Keep the drag from also swiping the message (swipe to reply).
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            setScrubbing(true);
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
          {peaks.map((peak, i) => {
            const played = (i + 0.5) / peaks.length <= progress;
            return (
              <span
                key={i}
                className={cn(
                  "w-[3px] flex-1 rounded-full transition-colors",
                  played
                    ? isOwnMessage ? "bg-white" : "bg-primary"
                    : isOwnMessage ? "bg-white/40" : "bg-foreground/25"
                )}
                style={{ height: `${Math.max(12, Math.round(peak * 100))}%` }}
              />
            );
          })}
          {/* The playhead */}
          <span
            className={cn("pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow", isOwnMessage ? "bg-white" : "bg-primary")}
            style={{ left: `${progress * 100}%` }}
            aria-hidden="true"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className={cn("text-[11px] tabular-nums", isOwnMessage ? "text-white/75" : "text-muted-foreground")}>
            {formatTime(showTime)}
          </span>
          <button
            type="button"
            onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}
            aria-label={`Playback speed ${speed} times`}
            className={cn(
              "rounded-full px-1.5 text-[10.5px] font-bold leading-[18px]",
              isOwnMessage ? "bg-white/20 text-white" : "bg-foreground/10 text-foreground"
            )}
          >
            {speed}×
          </button>
        </div>
      </div>
    </div>
  );
};

export default VoiceMessagePlayer;
