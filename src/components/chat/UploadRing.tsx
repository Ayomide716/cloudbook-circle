import { cn } from "@/lib/utils";

/**
 * The ring over a photo or video while it uploads, filling as it goes (spinning until the
 * upload itself starts), as on WhatsApp.
 */
const UploadRing = ({ progress, className }: { progress?: number; className?: string }) => {
  const r = 18;
  const c = 2 * Math.PI * r;
  const known = !!progress && progress > 0;
  return (
    <span
      role="progressbar"
      aria-label="Sending"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={known ? progress : undefined}
      className={cn("flex h-12 w-12 items-center justify-center rounded-full bg-black/50", className)}
    >
      <svg viewBox="0 0 44 44" className={cn("h-11 w-11 -rotate-90", !known && "animate-spin")} aria-hidden="true">
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
        <circle
          cx="22" cy="22" r={r} fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={known ? c * (1 - Math.min(100, progress!) / 100) : c * 0.75}
          className="transition-[stroke-dashoffset] duration-200"
        />
      </svg>
    </span>
  );
};

export default UploadRing;
