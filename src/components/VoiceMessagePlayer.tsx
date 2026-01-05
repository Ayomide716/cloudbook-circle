import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceMessagePlayerProps {
  audioUrl: string;
  duration?: number;
  isOwnMessage?: boolean;
}

const VoiceMessagePlayer = ({ audioUrl, duration, isOwnMessage }: VoiceMessagePlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      if (!duration) {
        setAudioDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [duration]);

  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  return (
    <div className={cn(
      "flex items-center gap-2 min-w-[180px]",
    )}>
      <audio ref={audioRef} src={audioUrl} preload="metadata" className="hidden" />
      
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-10 w-10 rounded-full flex-shrink-0",
          isOwnMessage 
            ? "bg-primary-foreground/20 hover:bg-primary-foreground/30" 
            : "bg-foreground/10 hover:bg-foreground/20"
        )}
        onClick={togglePlayback}
      >
        {isPlaying ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5 ml-0.5" />
        )}
      </Button>

      <div className="flex-1 flex flex-col gap-1">
        <div className={cn(
          "h-1.5 rounded-full overflow-hidden",
          isOwnMessage ? "bg-primary-foreground/30" : "bg-foreground/20"
        )}>
          <div 
            className={cn(
              "h-full transition-all duration-100",
              isOwnMessage ? "bg-primary-foreground" : "bg-foreground/60"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className={cn(
          "text-[10px]",
          isOwnMessage ? "text-primary-foreground/70" : "text-muted-foreground"
        )}>
          {formatTime(currentTime)} / {formatTime(audioDuration)}
        </span>
      </div>
    </div>
  );
};

export default VoiceMessagePlayer;
