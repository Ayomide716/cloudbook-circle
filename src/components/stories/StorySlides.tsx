import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "@/components/icons";
import { BLANK_POSTER } from "@/lib/video-poster";

export interface Slide {
  id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  created_at: string;
}

interface StorySlidesProps {
  title: string;
  slides: Slide[];
  onClose: () => void;
  /** Your own highlight: a bin button to delete it. */
  onDelete?: () => void;
}

const PHOTO_MS = 5000;

/** A highlight played like a story: bars across the top, tap left / right, photos for 5 s. */
const StorySlides = ({ title, slides, onClose, onDelete }: StorySlidesProps) => {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const slide = slides[index];

  const next = () => (index < slides.length - 1 ? setIndex(index + 1) : onClose());
  const prev = () => setIndex(Math.max(0, index - 1));

  // Moving on from a video (or closing): stop it and let go of the file, so Android's web view
  // doesn't keep its sound going under the next one (as in StoriesBar).
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    return () => {
      v.pause();
      v.removeAttribute("src");
      v.load();
    };
  }, [slide?.id]);
  useEffect(() => {
    setProgress(0);
    if (!slide || slide.media_type === "video") return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const p = ((Date.now() - started) / PHOTO_MS) * 100;
      if (p >= 100) {
        window.clearInterval(timer);
        next();
      } else setProgress(p);
    }, 50);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restarts per slide only
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!slide) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black text-white" role="dialog" aria-label={title}>
      <div className="absolute inset-x-0 top-0 z-20 space-y-2 px-2 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)]">
        <div className="flex gap-0.5">
          {slides.map((s, i) => (
            <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
              <div className="h-full rounded-full bg-white" style={{ width: i < index ? "100%" : i === index ? `${progress}%` : "0%" }} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 px-1">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
            {title} <span className="font-normal text-white/70">· {new Date(slide.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>
          </p>
          {onDelete && (
            <button type="button" onClick={onDelete} aria-label="Delete highlight" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/20">
              <Trash2 className="h-5 w-5" />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/20">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {slide.media_type === "video" ? (
        <video
          key={slide.id}
          ref={videoRef}
          src={slide.media_url}
          poster={BLANK_POSTER}
          autoPlay
          playsInline
          className="max-h-full max-w-full object-contain"
          onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProgress((v.currentTime / v.duration) * 100); }}
          onEnded={next}
          onError={next}
        />
      ) : (
        <img key={slide.id} src={slide.media_url} alt="" className="max-h-full max-w-full object-contain" />
      )}

      {slide.caption && (
        <p className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+2rem)] z-20 mx-6 rounded-xl bg-black/50 px-4 py-2 text-center text-sm">{slide.caption}</p>
      )}

      <button type="button" className="absolute left-0 top-0 z-10 h-full w-1/3" onClick={prev} aria-label="Previous" />
      <button type="button" className="absolute right-0 top-0 z-10 h-full w-2/3" onClick={next} aria-label="Next" />
    </div>,
    document.body
  );
};

export default StorySlides;
