import { forwardRef, useEffect, useImperativeHandle, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CallButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  /** "off" shows a muted/disabled state, "on" a highlighted one. */
  tone?: "default" | "off" | "on" | "end";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = { sm: "h-9 w-9 [&_svg]:h-4 [&_svg]:w-4", md: "h-12 w-12 [&_svg]:h-5 [&_svg]:w-5", lg: "h-14 w-14 [&_svg]:h-6 [&_svg]:w-6" };
const TONES = {
  default: "bg-white/15 text-white hover:bg-white/25",
  off: "bg-white text-neutral-900 hover:bg-white/90",
  on: "gradient-brand text-primary-foreground hover:opacity-90",
  end: "bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/30",
};

/** Round call control with a label for screen readers and a tooltip for mouse users. */
export const CallButton = ({ label, onClick, children, tone = "default", size = "md", className }: CallButtonProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={cn(
          "shrink-0 rounded-full flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
          SIZES[size],
          TONES[tone],
          className
        )}
      >
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

interface StreamVideoProps {
  stream: MediaStream | null;
  mirror?: boolean;
  className?: string;
  "data-remote"?: boolean;
}

/** A <video> showing a MediaStream. Always muted: sound plays through StreamAudio. */
export const StreamVideo = forwardRef<HTMLVideoElement, StreamVideoProps>(({ stream, mirror, className, ...rest }, ref) => {
  const el = useRef<HTMLVideoElement>(null);
  useImperativeHandle(ref, () => el.current as HTMLVideoElement);
  useEffect(() => {
    const v = el.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    if (stream) v.play().catch(() => {});
  }, [stream]);
  return (
    <video
      ref={el}
      autoPlay
      playsInline
      muted
      className={cn(mirror && "-scale-x-100", className)}
      {...rest}
    />
  );
});
StreamVideo.displayName = "StreamVideo";

/** Plays a MediaStream's sound. Kept mounted for the whole call so audio never cuts out. */
export const StreamAudio = ({ stream, muted }: { stream: MediaStream | null; muted?: boolean }) => {
  const el = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const a = el.current;
    if (!a) return;
    if (a.srcObject !== stream) a.srcObject = stream;
    if (stream) a.play().catch(() => {});
  }, [stream]);
  useEffect(() => {
    if (el.current) el.current.muted = !!muted;
  }, [muted]);
  return <audio ref={el} autoPlay className="hidden" />;
};
