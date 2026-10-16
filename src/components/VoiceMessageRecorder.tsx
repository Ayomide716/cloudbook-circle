import { uploadMedia } from "@/lib/media-upload";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Loader2, Play, Pause, X } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { cn, getErrorMessage } from "@/lib/utils";
import { useEffectEvent } from "@/hooks/use-effect-event";

interface VoiceMessageRecorderProps {
  onVoiceMessageSent: (audioUrl: string, duration: number) => void;
  disabled?: boolean;
  /** Told when recording/previewing starts or ends, so the composer can give the recorder the whole row. */
  onActiveChange?: (active: boolean) => void;
  /** Classes for the idle mic button (the chat shows it as a round button, like WhatsApp). */
  buttonClassName?: string;
}

const VoiceMessageRecorder = ({ onVoiceMessageSent, disabled, onActiveChange, buttonClassName }: VoiceMessageRecorderProps) => {
  const notifyActive = useEffectEvent((active: boolean) => onActiveChange?.(active));
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const isActive = isRecording || !!audioUrl;
  useEffect(() => {
    notifyActive(isActive);
  }, [isActive, notifyActive]);
  const [isPlaying, setIsPlaying] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      toast({
        title: "Microphone access denied",
        description: "Please allow microphone access to record voice messages",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const cancelRecording = () => {
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setRecordingDuration(0);
  };

  const togglePlayback = () => {
    if (!audioRef.current || !audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const sendVoiceMessage = async () => {
    if (!audioBlob) return;

    setIsUploading(true);

    try {
      const fileName = `voice_${Date.now()}_${Math.random().toString(36).substring(7)}.webm`;
      const publicUrl = await uploadMedia("voice-messages", fileName, new File([audioBlob], fileName, { type: "audio/webm" }));

      onVoiceMessageSent(publicUrl, recordingDuration);
      cancelRecording();
    } catch (error) {
      console.error("Voice message upload error:", error);
      toast({
        title: "Error sending voice message",
        description: getErrorMessage(error) || "Failed to upload voice message",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Preview mode - show recorded audio
  if (audioBlob && audioUrl) {
    return (
      <div className="flex flex-1 items-center gap-2 bg-secondary/50 rounded-full px-3 py-1.5">
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={togglePlayback}
          aria-label={isPlaying ? "Pause recording" : "Play recording"}
        >
          {isPlaying ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        <div className="flex flex-1 items-center gap-2">
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary w-full" />
          </div>
          <span className="text-xs text-muted-foreground min-w-[32px]">
            {formatDuration(recordingDuration)}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full text-destructive hover:text-destructive"
          onClick={cancelRecording}
          aria-label="Discard voice message"
        >
          <X className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-full"
          onClick={sendVoiceMessage}
          disabled={isUploading}
          aria-label="Send voice message"
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Send"
          )}
        </Button>
      </div>
    );
  }

  // Recording mode
  if (isRecording) {
    return (
      <div className="flex flex-1 items-center gap-2 bg-destructive/10 rounded-full px-3 py-1.5">
        <div className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
        <span className="text-sm font-medium text-destructive flex-1">
          Recording… {formatDuration(recordingDuration)}
        </span>
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="h-8 w-8 rounded-full"
          onClick={stopRecording}
          aria-label="Stop recording"
        >
          <Square className="h-3 w-3 fill-current" />
        </Button>
      </div>
    );
  }

  // Default - show mic button
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={buttonClassName ?? "h-10 w-10 rounded-full hover:bg-primary/10 text-muted-foreground hover:text-primary"}
      onClick={startRecording}
      disabled={disabled}
      aria-label="Record voice message"
    >
      <Mic className="h-5 w-5" />
    </Button>
  );
};

export default VoiceMessageRecorder;
