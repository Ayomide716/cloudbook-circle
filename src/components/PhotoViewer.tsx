import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface PhotoViewerProps {
  images: string[];
  /** The photo to show; null keeps the viewer closed. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  /** Shown under the photo, e.g. the author's name. */
  caption?: React.ReactNode;
}

/** Full-screen, dark photo viewer: arrows, swipe and arrow keys move between photos. */
const PhotoViewer = ({ images, index, onIndexChange, caption }: PhotoViewerProps) => {
  const open = index !== null && images.length > 0;
  const current = Math.min(index ?? 0, images.length - 1);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});

  const go = (delta: number) => {
    const next = current + delta;
    if (next >= 0 && next < images.length) onIndexChange(next);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Fetch the neighbours early so swiping doesn't wait on the network.
  useEffect(() => {
    if (!open) return;
    for (const i of [current - 1, current + 1]) {
      if (images[i]) new Image().src = images[i];
    }
  }, [open, current, images]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onIndexChange(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col bg-black text-white outline-none"
          onTouchStart={(e) => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
          onTouchEnd={(e) => {
            const start = touchStart.current;
            touchStart.current = null;
            if (!start) return;
            const dx = e.changedTouches[0].clientX - start.x;
            const dy = e.changedTouches[0].clientY - start.y;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
            else if (dy > 120 && Math.abs(dy) > Math.abs(dx)) onIndexChange(null);
          }}
        >
          <DialogPrimitive.Title className="sr-only">Photo viewer</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Photo {current + 1} of {images.length}. Use the arrow keys or swipe to see the others.
          </DialogPrimitive.Description>

          <div className="flex h-14 shrink-0 items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
            <DialogPrimitive.Close className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close">
              <X className="h-6 w-6" />
            </DialogPrimitive.Close>
            {images.length > 1 && (
              <span className="text-sm font-semibold" aria-live="polite">
                {current + 1} of {images.length}
              </span>
            )}
            <span className="w-11" />
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            {!loaded[images[current]] && (
              <div className="absolute h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            <img
              key={images[current]}
              src={images[current]}
              alt={`Photo ${current + 1} of ${images.length}`}
              onLoad={() => setLoaded((prev) => ({ ...prev, [images[current]]: true }))}
              className="max-h-full max-w-full select-none object-contain"
              draggable={false}
            />
            {current > 0 && (
              <button
                type="button"
                onClick={() => go(-1)}
                className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 hover:bg-black/75 sm:left-4"
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            {current < images.length - 1 && (
              <button
                type="button"
                onClick={() => go(1)}
                className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 hover:bg-black/75 sm:right-4"
                aria-label="Next photo"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>

          <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {caption && <div className="mx-auto mb-3 max-w-2xl text-sm text-white/85">{caption}</div>}
            {images.length > 1 && (
              <div className="flex justify-center gap-1.5">
                {images.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onIndexChange(i)}
                    className="flex h-6 w-4 items-center justify-center"
                    aria-label={`Show photo ${i + 1}`}
                    aria-current={i === current}
                  >
                    <span className={i === current ? "h-2 w-2 rounded-full bg-white" : "h-1.5 w-1.5 rounded-full bg-white/45"} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default PhotoViewer;
