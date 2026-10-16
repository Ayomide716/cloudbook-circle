import { ChevronsLeft, ChevronsRight } from "@/components/icons";
import { cn } from "@/lib/utils";
import { SEEK_SECONDS } from "@/lib/video-seek";

/**
 * The "« 10 seconds" sign that flashes on the side you double-tapped, as on Facebook and
 * YouTube. Give it a new key each time so it plays again.
 */
const SeekFlash = ({ side }: { side: -1 | 1 }) => (
  <div
    className={cn(
      "seek-flash pointer-events-none absolute inset-y-0 z-30 flex w-2/5 items-center justify-center bg-white/15 text-white",
      side < 0 ? "left-0 rounded-r-[50%]" : "right-0 rounded-l-[50%]"
    )}
    aria-hidden="true"
  >
    <span className="flex flex-col items-center gap-0.5 text-xs font-semibold drop-shadow">
      {side < 0 ? <ChevronsLeft className="h-7 w-7" /> : <ChevronsRight className="h-7 w-7" />}
      {SEEK_SECONDS} seconds
    </span>
  </div>
);

export default SeekFlash;
