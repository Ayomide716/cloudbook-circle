import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "@/components/icons";

interface PhotoViewerProps {
  images: string[];
  /** The photo to show; null keeps the viewer closed. */
  index: number | null;
  onIndexChange: (index: number | null) => void;
  /** Shown under the photo, e.g. the author's name. */
  caption?: React.ReactNode;
}

type Point = { x: number; y: number };
const MAX_ZOOM = 4;
const DOUBLE_TAP_MS = 280;
const distance = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

/**
 * Full-screen, dark photo viewer: arrows, swipe and arrow keys move between photos. Pinch or
 * double-tap to zoom (drag to look around), and pull the photo down to close, as on Facebook.
 */
const PhotoViewer = ({ images, index, onIndexChange, caption }: PhotoViewerProps) => {
  const open = index !== null && images.length > 0;
  const current = Math.min(index ?? 0, images.length - 1);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  // Zoom and position of the photo, and how far it's been pulled down.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [pull, setPull] = useState(0);
  const [touching, setTouching] = useState(false);
  const gesture = useRef<{ start: Point; pan: Point; zoom: number; dist: number; pinched: boolean } | null>(null);
  const lastTap = useRef(0);

  // Each photo starts whole.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setPull(0);
  }, [current, open]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches;
    setTouching(true);
    gesture.current = {
      start: { x: t[0].clientX, y: t[0].clientY },
      pan,
      zoom,
      dist: t.length > 1 ? distance(t) : 0,
      pinched: t.length > 1 || !!gesture.current?.pinched,
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    if (!g) return;
    const t = e.touches;
    if (t.length > 1 && g.dist) {
      setZoom(Math.min(MAX_ZOOM, Math.max(1, (g.zoom * distance(t)) / g.dist)));
      return;
    }
    const dx = t[0].clientX - g.start.x;
    const dy = t[0].clientY - g.start.y;
    if (zoom > 1) setPan({ x: g.pan.x + dx, y: g.pan.y + dy });
    else if (!g.pinched && dy > 0 && Math.abs(dy) > Math.abs(dx)) setPull(dy);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (e.touches.length > 0) {
      // One finger lifted after a pinch: carry on dragging from the finger still down.
      gesture.current = { ...g, start: { x: e.touches[0].clientX, y: e.touches[0].clientY }, pan, zoom, dist: 0 };
      return;
    }
    gesture.current = null;
    setTouching(false);
    if (zoom <= 1.05) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
    if (g.pinched || g.zoom > 1) return;
    const end = e.changedTouches[0];
    const dx = end.clientX - g.start.x;
    const dy = end.clientY - g.start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
    else if (dy > 120 && Math.abs(dy) > Math.abs(dx)) onIndexChange(null);
    else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      // A double tap zooms in on that spot, or back out.
      const now = Date.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        if (zoom > 1) {
          setZoom(1);
          setPan({ x: 0, y: 0 });
        } else {
          const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setZoom(2.5);
          setPan({ x: (box.left + box.width / 2 - end.clientX) * 1.5, y: (box.top + box.height / 2 - end.clientY) * 1.5 });
        }
      } else lastTap.current = now;
    }
    setPull(0);
  };

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
        {/* The black fades as you pull the photo down, showing the page behind. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black" style={{ opacity: 1 - Math.min(pull / 400, 0.7) }} />
        <DialogPrimitive.Content className="fixed inset-0 z-50 flex flex-col text-white outline-none">
          <DialogPrimitive.Title className="sr-only">Photo viewer</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Photo {current + 1} of {images.length}. Use the arrow keys or swipe to see the others.
          </DialogPrimitive.Description>

          <div className="flex h-14 shrink-0 transition-opacity items-center justify-between px-2 pt-[env(safe-area-inset-top)]" style={{ opacity: pull ? 0 : 1 }}>
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

          <div
            className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
          >
            {!loaded[images[current]] && (
              <div className="absolute h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            )}
            <img
              key={images[current]}
              src={images[current]}
              alt={`Photo ${current + 1} of ${images.length}`}
              onLoad={() => setLoaded((prev) => ({ ...prev, [images[current]]: true }))}
              className="max-h-full max-w-full select-none object-contain"
              style={{
                transform: `translate(${pan.x}px, ${pan.y + pull}px) scale(${zoom * (1 - Math.min(pull / 1500, 0.2))})`,
                transition: touching ? "none" : "transform 0.25s ease-out",
              }}
              draggable={false}
            />
            {current > 0 && zoom === 1 && (
              <button
                type="button"
                onClick={() => go(-1)}
                className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 hover:bg-black/75 sm:left-4"
                aria-label="Previous photo"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            {current < images.length - 1 && zoom === 1 && (
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

          <div style={{ opacity: pull ? 0 : 1 }} className="shrink-0 transition-opacity px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
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
