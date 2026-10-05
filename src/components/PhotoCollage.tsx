import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface PhotoCollageProps {
  images: string[];
  /** Opens the full-screen viewer at this photo. */
  onOpen: (index: number) => void;
  /** Double-tap on a photo, as in Facebook and Instagram (used to like the post). */
  onDoubleTap?: () => void;
  className?: string;
}

/** Most tiles shown in the post; the last one counts the rest ("+3"). */
const MAX_TILES = 5;

/**
 * Facebook-style photo layouts: 2 side by side, 3 as one large and two small,
 * 4 as one wide over three, 5 or more as two over three with a "+N" tile.
 */
/** How long to wait for a second tap before treating a tap as "open the photo". */
const DOUBLE_TAP_MS = 260;

const PhotoCollage = ({ images, onOpen, onDoubleTap, className }: PhotoCollageProps) => {
  const pending = useRef<number | null>(null);
  useEffect(() => () => { if (pending.current) window.clearTimeout(pending.current); }, []);

  // Without a double-tap action a tap opens the photo at once; with one, a second tap
  // within DOUBLE_TAP_MS likes instead of opening.
  const tap = (index: number) => {
    if (!onDoubleTap) return onOpen(index);
    if (pending.current) {
      window.clearTimeout(pending.current);
      pending.current = null;
      onDoubleTap();
      return;
    }
    pending.current = window.setTimeout(() => {
      pending.current = null;
      onOpen(index);
    }, DOUBLE_TAP_MS);
  };

  const count = images.length;
  if (count === 0) return null;

  const tile = (index: number, extraClass?: string) => {
    const hidden = index === MAX_TILES - 1 ? count - MAX_TILES : 0;
    return (
      <button
        key={index}
        type="button"
        onClick={() => tap(index)}
        className={cn("relative block overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", extraClass)}
        aria-label={hidden > 0 ? `Open photo ${index + 1} of ${count}, ${hidden} more` : `Open photo ${index + 1} of ${count}`}
      >
        <img src={images[index]} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]" />
        {hidden > 0 && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-3xl font-bold text-white font-display">
            +{hidden}
          </span>
        )}
      </button>
    );
  };

  if (count === 1) {
    return (
      <button
        type="button"
        onClick={() => tap(0)}
        className={cn("flex w-full justify-center bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", className)}
        aria-label="Open photo"
      >
        <img src={images[0]} alt="" loading="lazy" className="w-full max-h-[600px] object-contain" />
      </button>
    );
  }

  if (count === 2) {
    return (
      <div className={cn("grid grid-cols-2 gap-0.5", className)}>
        {tile(0, "aspect-[4/5]")}
        {tile(1, "aspect-[4/5]")}
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className={cn("grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-0.5", className)}>
        {tile(0, "row-span-2")}
        {tile(1)}
        {tile(2)}
      </div>
    );
  }

  if (count === 4) {
    return (
      <div className={cn("flex flex-col gap-0.5", className)}>
        {tile(0, "aspect-[16/9] w-full")}
        <div className="grid grid-cols-3 gap-0.5">
          {tile(1, "aspect-square")}
          {tile(2, "aspect-square")}
          {tile(3, "aspect-square")}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <div className="grid grid-cols-2 gap-0.5">
        {tile(0, "aspect-square")}
        {tile(1, "aspect-square")}
      </div>
      <div className="grid grid-cols-3 gap-0.5">
        {tile(2, "aspect-square")}
        {tile(3, "aspect-square")}
        {tile(4, "aspect-square")}
      </div>
    </div>
  );
};

export default PhotoCollage;
