import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, RotateCw, X } from "@/components/icons";
import { Slider } from "@/components/ui/slider";
import DarkStatusBar from "@/components/DarkStatusBar";
import { cn } from "@/lib/utils";

/** Looks, as on Instagram: each is a CSS filter (canvas uses the same ones when saving). */
const PHOTO_FILTERS: { id: string; label: string; css: string }[] = [
  { id: "none", label: "Original", css: "" },
  { id: "vivid", label: "Vivid", css: "saturate(1.35) contrast(1.08)" },
  { id: "warm", label: "Warm", css: "sepia(0.22) saturate(1.2) hue-rotate(-8deg)" },
  { id: "cool", label: "Cool", css: "saturate(1.05) hue-rotate(12deg) brightness(1.03)" },
  { id: "fade", label: "Fade", css: "contrast(0.86) brightness(1.08) saturate(0.85)" },
  { id: "drama", label: "Drama", css: "contrast(1.3) saturate(1.1) brightness(0.95)" },
  { id: "mono", label: "Mono", css: "grayscale(1) contrast(1.1)" },
  { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.45) brightness(0.9)" },
];

const ASPECTS = [
  { id: "original", label: "Original", ratio: null as number | null },
  { id: "square", label: "1:1", ratio: 1 },
  { id: "portrait", label: "4:5", ratio: 4 / 5 },
  { id: "wide", label: "16:9", ratio: 16 / 9 },
];

type Tab = "crop" | "filter" | "adjust";
const MAX_SIDE = 2048;

interface PhotoEditorProps {
  /** The photo: the picked file, or its address when the file isn't at hand. */
  source: File | string;
  onCancel: () => void;
  onDone: (edited: File) => void;
}

/**
 * Edit a photo before it's posted, as on Instagram: crop (drag and pinch inside the frame,
 * or pick a shape), rotate, a filter, and brightness, contrast and colour. Saved as a new JPEG.
 */
const PhotoEditor = ({ source, onCancel, onDone }: PhotoEditorProps) => {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("crop");
  const [aspect, setAspect] = useState(ASPECTS[0]);
  const [rotation, setRotation] = useState(0); // quarter turns
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 }); // in frame fractions
  const [filter, setFilter] = useState(PHOTO_FILTERS[0]);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [saving, setSaving] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; pan: { x: number; y: number }; dist: number; zoom: number } | null>(null);

  useEffect(() => {
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    const image = new Image();
    if (typeof source === "string") image.crossOrigin = "anonymous";
    image.onload = () => setImg(image);
    image.onerror = () => setFailed(true);
    image.src = url;
    return () => { if (typeof source !== "string") URL.revokeObjectURL(url); };
  }, [source]);

  // The photo's shape once turned.
  const turned = rotation % 2 === 1;
  const naturalRatio = img ? (turned ? img.naturalHeight / img.naturalWidth : img.naturalWidth / img.naturalHeight) : 1;
  const frameRatio = aspect.ratio ?? naturalRatio;
  const cssFilter = useMemo(
    () => [filter.css, `brightness(${brightness / 100})`, `contrast(${contrast / 100})`, `saturate(${saturation / 100})`].filter(Boolean).join(" "),
    [filter, brightness, contrast, saturation],
  );

  // How big the photo is in the frame (as a multiple of the frame), covering it at zoom 1.
  const cover = frameRatio > naturalRatio ? { w: 1, h: frameRatio / naturalRatio } : { w: naturalRatio / frameRatio, h: 1 };
  const clampPan = (p: { x: number; y: number }, z = zoom) => {
    const maxX = Math.max(0, (cover.w * z - 1) / 2);
    const maxY = Math.max(0, (cover.h * z - 1) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) };
  };
  useEffect(() => { setPan((p) => clampPan(p)); }, [aspect, rotation, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches;
    const dist = t.length > 1 ? Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) : 0;
    gesture.current = { x: t[0].clientX, y: t[0].clientY, pan, dist, zoom };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    const frame = frameRef.current?.getBoundingClientRect();
    if (!g || !frame) return;
    const t = e.touches;
    if (t.length > 1 && g.dist) {
      const z = Math.min(4, Math.max(1, (g.zoom * Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)) / g.dist));
      setZoom(z);
      return;
    }
    setPan(clampPan({ x: g.pan.x + (t[0].clientX - g.x) / frame.width, y: g.pan.y + (t[0].clientY - g.y) / frame.height }));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    gesture.current = { x: e.clientX, y: e.clientY, pan, dist: 0, zoom };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" || !gesture.current || !(e.buttons & 1)) return;
    const frame = frameRef.current?.getBoundingClientRect();
    if (!frame) return;
    const g = gesture.current;
    setPan(clampPan({ x: g.pan.x + (e.clientX - g.x) / frame.width, y: g.pan.y + (e.clientY - g.y) / frame.height }));
  };

  const save = async () => {
    if (!img) return;
    setSaving(true);
    try {
      // The frame's size in the photo's own pixels.
      const srcW = turned ? img.naturalHeight : img.naturalWidth;
      const srcH = turned ? img.naturalWidth : img.naturalHeight;
      // The frame shows 1 / (cover × zoom) of the photo across.
      let outW = Math.round(srcW / (cover.w * zoom));
      let outH = Math.round(outW / frameRatio);
      const scaleDown = Math.min(1, MAX_SIDE / Math.max(outW, outH));
      outW = Math.max(1, Math.round(outW * scaleDown));
      outH = Math.max(1, Math.round(outH * scaleDown));
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, outW, outH);
      ctx.filter = cssFilter || "none";
      // Same placement as on screen: the photo centred, panned, zoomed and turned in the frame.
      const drawW = outW * cover.w * zoom;
      const drawH = outH * cover.h * zoom;
      ctx.translate(outW / 2 + pan.x * outW, outH / 2 + pan.y * outH);
      ctx.rotate((rotation * Math.PI) / 2);
      const [w, h] = turned ? [drawH, drawW] : [drawW, drawH];
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("save failed");
      onDone(new File([blob], `edited-${Date.now()}.jpg`, { type: "image/jpeg" }));
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };

  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-[140] flex flex-col bg-neutral-950 text-white animate-in fade-in-0 duration-200" role="dialog" aria-label="Edit photo">
      <DarkStatusBar />
      <div className="flex items-center justify-between px-2 pt-[calc(env(safe-area-inset-top)+0.25rem)] pb-1">
        <button type="button" onClick={onCancel} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Cancel">
          <X className="h-6 w-6" />
        </button>
        <span className="text-[15px] font-semibold">Edit photo</span>
        <button type="button" onClick={save} disabled={!img || saving} className="flex h-11 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold text-primary disabled:opacity-50" aria-label="Done">
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Check className="h-5 w-5" /> Done</>}
        </button>
      </div>

      {/* The photo in its frame: drag to move it, pinch (or the slider) to zoom. */}
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {failed ? (
          <p className="px-6 text-center text-sm text-white/80">This photo can't be edited here. You can still post it as it is.</p>
        ) : !img ? (
          <Loader2 className="h-8 w-8 animate-spin text-white/70" />
        ) : (
          <div
            ref={frameRef}
            className="relative max-h-full max-w-full touch-none overflow-hidden [container-type:size]"
            style={{ aspectRatio: String(frameRatio), height: frameRatio < 1 ? "100%" : undefined, width: frameRatio >= 1 ? "100%" : undefined }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={() => { gesture.current = null; }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => { gesture.current = null; }}
          >
            <img
              src={img.src}
              alt="Photo being edited"
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={{
                width: `${(turned ? cover.h : cover.w) * 100}%`,
                height: `${(turned ? cover.w : cover.h) * 100}%`,
                transform: `translate(-50%, -50%) translate(${pan.x * 100}cqw, ${pan.y * 100}cqh) rotate(${rotation * 90}deg) scale(${zoom})`,
                filter: cssFilter,
              }}
            />
            {tab === "crop" && (
              // A rule-of-thirds grid while cropping.
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 border border-white/70" aria-hidden="true">
                {Array.from({ length: 9 }, (_, i) => <span key={i} className="border border-white/20" />)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tools */}
      <div className="space-y-3 px-4 pb-2">
        {tab === "crop" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide" data-no-tab-swipe="">
              {ASPECTS.map((a) => (
                <button key={a.id} type="button" onClick={() => setAspect(a)} aria-pressed={aspect.id === a.id}
                  className={cn("h-9 shrink-0 rounded-full px-4 text-sm font-semibold", aspect.id === a.id ? "bg-white text-black" : "bg-white/10 text-white")}>
                  {a.label}
                </button>
              ))}
              <button type="button" onClick={() => setRotation((r) => (r + 1) % 4)} className="ml-auto flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-semibold" aria-label="Rotate">
                <RotateCw className="h-4 w-4" /> Rotate
              </button>
            </div>
            <label className="flex items-center gap-3 text-xs text-white/70">
              Zoom
              <Slider value={[zoom]} min={1} max={4} step={0.01} onValueChange={([z]) => setZoom(z)} className="flex-1" aria-label="Zoom" />
            </label>
          </div>
        )}
        {tab === "filter" && img && (
          <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide" data-no-tab-swipe="">
            {PHOTO_FILTERS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFilter(f)} aria-pressed={filter.id === f.id} className="flex shrink-0 flex-col items-center gap-1.5">
                <span className={cn("block h-16 w-16 overflow-hidden rounded-xl ring-2", filter.id === f.id ? "ring-white" : "ring-transparent")}>
                  <img src={img.src} alt="" className="h-full w-full object-cover" style={{ filter: f.css }} />
                </span>
                <span className={cn("text-xs", filter.id === f.id ? "font-semibold text-white" : "text-white/70")}>{f.label}</span>
              </button>
            ))}
          </div>
        )}
        {tab === "adjust" && (
          <div className="space-y-3">
            {([["Brightness", brightness, setBrightness], ["Contrast", contrast, setContrast], ["Colour", saturation, setSaturation]] as const).map(([label, value, set]) => (
              <label key={label} className="grid grid-cols-[80px_1fr_36px] items-center gap-3 text-sm">
                <span className="text-white/80">{label}</span>
                <Slider value={[value]} min={50} max={150} step={1} onValueChange={([v]) => set(v)} aria-label={label} />
                <span className="text-right tabular-nums text-white/60">{value - 100 > 0 ? "+" : ""}{value - 100}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 border-t border-white/10 pb-[env(safe-area-inset-bottom)]" role="tablist" aria-label="Editing tools">
        {(["crop", "filter", "adjust"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn("h-12 text-sm font-semibold capitalize", tab === t ? "text-white" : "text-white/50")}>
            {t === "crop" ? "Crop" : t === "filter" ? "Filters" : "Adjust"}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
};

export default PhotoEditor;
