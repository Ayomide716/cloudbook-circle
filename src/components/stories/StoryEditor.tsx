import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { AtSign, BarChart3, Check, Clock, Loader2, MapPin, PenLine, Smile, Trash2, Type, Undo2, X } from "@/components/icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import DarkStatusBar from "@/components/DarkStatusBar";
import { features } from "@/lib/features";
import { haptic } from "@/lib/haptics";
import { STORY_BACKGROUNDS, type StoryOverlay } from "@/lib/story-overlay";
import { cn } from "@/lib/utils";

const COLORS = ["#ffffff", "#111111", "#ff6b2c", "#facc15", "#22c55e", "#3b82f6", "#a855f7", "#ef4444"];
const OUT_W = 1080;
const OUT_H = 1920;

type Kind = "text" | "time" | "place" | "mention" | "poll";
interface Item {
  id: string;
  kind: Kind;
  x: number; // 0..1 of the story's width
  y: number;
  scale: number;
  text: string;
  color: string;
  /** Text on a coloured pill instead of plain. */
  pill: boolean;
  mention?: { id: string; name: string };
  poll?: { question: string; options: string[] };
}
interface Stroke { color: string; size: number; points: { x: number; y: number }[] }

interface StoryEditorProps {
  /** A photo to put text and stickers on; none for a text story on a colour. */
  photo?: File | null;
  currentUserId: string;
  onCancel: () => void;
  /** The finished story as a picture, and what can be tapped on it. */
  onDone: (result: { file: File; overlay: StoryOverlay | null }) => void;
}

const uid = () => Math.random().toString(36).slice(2);
const timeLabel = () => new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** How a sticker or text looks, both on screen and when the story is saved. */
function itemLabel(item: Item) {
  if (item.kind === "time") return `🕒 ${item.text}`;
  if (item.kind === "place") return `📍 ${item.text}`;
  if (item.kind === "mention") return `@${item.text}`;
  return item.text;
}
const isSticker = (k: Kind) => k === "time" || k === "place" || k === "mention";

/**
 * Make a story, as on Instagram: write on it (drag, pinch to resize), draw, and add stickers:
 * the time, a place, someone you mention (they're told) and a poll your friends vote on. Or a
 * text story on a colour. Drag anything onto the bin to remove it.
 */
const StoryEditor = ({ photo, currentUserId, onCancel, onDone }: StoryEditorProps) => {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [background, setBackground] = useState(STORY_BACKGROUNDS[0]);
  const [items, setItems] = useState<Item[]>([]);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [mode, setMode] = useState<"move" | "draw">("move");
  const [penColor, setPenColor] = useState(COLORS[0]);
  const [penSize, setPenSize] = useState(8);
  // The text being typed (a new one, or one being changed).
  const [typing, setTyping] = useState<Item | null>(photo ? null : { id: uid(), kind: "text", x: 0.5, y: 0.45, scale: 1, text: "", color: "#ffffff", pill: false });
  const [stickerSheet, setStickerSheet] = useState<null | "menu" | "place" | "mention" | "poll">(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [overBin, setOverBin] = useState(false);
  const [saving, setSaving] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  // Straight to typing (after the "Create story" sheet has given focus back to the page).
  const typingRef = useRef<HTMLTextAreaElement>(null);
  const typingOpen = !!typing;
  useEffect(() => {
    if (!typingOpen) return;
    const t = window.setTimeout(() => {
      const el = typingRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 80);
    return () => window.clearTimeout(t);
  }, [typingOpen]);

  useEffect(() => {
    if (!photo) return;
    const url = URL.createObjectURL(photo);
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // ---- Drawing ----
  const redraw = useCallback(() => {
    const c = drawRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const s of strokes) paintStroke(ctx, s, c.width, c.height);
  }, [strokes]);
  useEffect(() => {
    const c = drawRef.current;
    const frame = frameRef.current;
    if (!c || !frame) return;
    const fit = () => {
      const r = frame.getBoundingClientRect();
      c.width = Math.round(r.width * devicePixelRatio);
      c.height = Math.round(r.height * devicePixelRatio);
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [redraw]);
  const current = useRef<Stroke | null>(null);
  const pointIn = (e: React.PointerEvent) => {
    const r = frameRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const drawDown = (e: React.PointerEvent) => {
    if (mode !== "draw") return;
    (e.target as Element).setPointerCapture(e.pointerId);
    current.current = { color: penColor, size: penSize, points: [pointIn(e)] };
  };
  const drawMove = (e: React.PointerEvent) => {
    const s = current.current;
    const c = drawRef.current;
    if (!s || !c) return;
    s.points.push(pointIn(e));
    paintStroke(c.getContext("2d")!, { ...s, points: s.points.slice(-2) }, c.width, c.height);
  };
  const drawUp = () => {
    if (current.current && current.current.points.length > 0) setStrokes((list) => [...list, current.current!]);
    current.current = null;
  };

  // ---- Moving, resizing and binning text and stickers ----
  const gesture = useRef<{ id: string; x: number; y: number; ix: number; iy: number; dist: number; scale: number; moved: boolean } | null>(null);
  const binRef = useRef<HTMLDivElement>(null);
  const onItemTouchStart = (e: React.TouchEvent, item: Item) => {
    if (mode !== "move") return;
    e.stopPropagation();
    const t = e.touches;
    gesture.current = {
      id: item.id, x: t[0].clientX, y: t[0].clientY, ix: item.x, iy: item.y,
      dist: t.length > 1 ? Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) : 0,
      scale: item.scale, moved: false,
    };
  };
  const onItemTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    const frame = frameRef.current?.getBoundingClientRect();
    if (!g || !frame) return;
    const t = e.touches;
    if (t.length > 1) {
      const d = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      if (!g.dist) { g.dist = d; g.scale = items.find((i) => i.id === g.id)?.scale ?? 1; return; }
      const scale = Math.min(4, Math.max(0.4, (g.scale * d) / g.dist));
      setItems((list) => list.map((i) => (i.id === g.id ? { ...i, scale } : i)));
      g.moved = true;
      return;
    }
    const dx = t[0].clientX - g.x, dy = t[0].clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < 6) return;
    g.moved = true;
    setDragging(g.id);
    setItems((list) => list.map((i) => (i.id === g.id ? { ...i, x: g.ix + dx / frame.width, y: g.iy + dy / frame.height } : i)));
    const bin = binRef.current?.getBoundingClientRect();
    const over = !!bin && t[0].clientY > bin.top - 20 && Math.abs(t[0].clientX - (bin.left + bin.width / 2)) < 60;
    if (over !== overBin) { setOverBin(over); if (over) haptic(10); }
  };
  const onItemTouchEnd = (item: Item) => {
    const g = gesture.current;
    gesture.current = null;
    setDragging(null);
    if (overBin) {
      setItems((list) => list.filter((i) => i.id !== item.id));
      setOverBin(false);
      return;
    }
    // A tap on text: change it.
    if (g && !g.moved && item.kind === "text") {
      setItems((list) => list.filter((i) => i.id !== item.id));
      setTyping(item);
    }
  };
  // Mouse (computers): drag only.
  const onItemPointerDown = (e: React.PointerEvent, item: Item) => {
    if (e.pointerType === "touch" || mode !== "move") return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    gesture.current = { id: item.id, x: e.clientX, y: e.clientY, ix: item.x, iy: item.y, dist: 0, scale: item.scale, moved: false };
  };
  const onItemPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    const frame = frameRef.current?.getBoundingClientRect();
    if (e.pointerType === "touch" || !g || !frame || !(e.buttons & 1)) return;
    g.moved = true;
    setItems((list) => list.map((i) => (i.id === g.id ? { ...i, x: g.ix + (e.clientX - g.x) / frame.width, y: g.iy + (e.clientY - g.y) / frame.height } : i)));
  };

  const finishTyping = () => {
    if (typing && typing.text.trim()) setItems((list) => [...list, { ...typing, text: typing.text.trim() }]);
    setTyping(null);
  };
  const addItem = (item: Omit<Item, "id" | "x" | "y" | "scale" | "color" | "pill"> & Partial<Item>) => {
    // Each new sticker gets its own spot, clear of the text in the middle (drag to move it).
    const SLOTS = [0.7, 0.22, 0.82, 0.32, 0.6, 0.12];
    setItems((list) => [...list, { id: uid(), x: 0.5, y: SLOTS[list.filter((i) => i.kind !== "text").length % SLOTS.length], scale: 1, color: "#111111", pill: true, ...item }]);
    setStickerSheet(null);
    setMode("move");
    haptic(8);
  };
  const hasPoll = items.some((i) => i.kind === "poll");

  // ---- Saving: everything except the poll and mention taps becomes one picture ----
  const save = async () => {
    setSaving(true);
    try {
      await document.fonts?.ready;
      const frame = frameRef.current!.getBoundingClientRect();
      const canvas = document.createElement("canvas");
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext("2d")!;
      if (img) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, OUT_W, OUT_H);
        const s = Math.max(OUT_W / img.naturalWidth, OUT_H / img.naturalHeight);
        const w = img.naturalWidth * s, h = img.naturalHeight * s;
        ctx.drawImage(img, (OUT_W - w) / 2, (OUT_H - h) / 2, w, h);
      } else {
        paintGradient(ctx, background);
      }
      for (const s of strokes) paintStroke(ctx, s, OUT_W, OUT_H, OUT_W / frame.width);
      const unit = OUT_W / frame.width;
      for (const item of items) {
        if (item.kind === "poll") continue;
        paintItem(ctx, item, unit);
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("save failed");
      const poll = items.find((i) => i.kind === "poll");
      const mentions = items.filter((i) => i.kind === "mention" && i.mention).map((i) => ({ id: i.mention!.id, name: i.mention!.name, x: i.x, y: i.y }));
      const overlay: StoryOverlay = {
        ...(poll?.poll ? { poll: { ...poll.poll, x: poll.x, y: poll.y } } : {}),
        ...(mentions.length ? { mentions } : {}),
      };
      onDone({ file: new File([blob], `story-${Date.now()}.jpg`, { type: "image/jpeg" }), overlay: overlay.poll || overlay.mentions ? overlay : null });
    } catch {
      setSaving(false);
    }
  };

  const canShare = !!img || items.length > 0 || strokes.length > 0;

  return createPortal(
    <div className="pointer-events-auto fixed inset-0 z-[140] flex flex-col items-center justify-center bg-black text-white" role="dialog" aria-label="Create story">
      <DarkStatusBar />
      {/* The story, 9:16, as big as fits. */}
      <div
        ref={frameRef}
        className="relative aspect-[9/16] max-h-full w-full max-w-[min(100vw,56.25dvh)] touch-none overflow-hidden [container-type:size] sm:rounded-2xl"
        style={img ? undefined : { background }}
        onPointerDown={drawDown}
        onPointerMove={drawMove}
        onPointerUp={drawUp}
        onPointerCancel={drawUp}
      >
        {img && <img src={img.src} alt="" className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover" draggable={false} />}
        <canvas ref={drawRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
        {items.map((item) => (
          <div
            key={item.id}
            className={cn("absolute left-0 top-0 select-none", mode === "move" ? "touch-none" : "pointer-events-none", dragging === item.id && overBin && "opacity-50")}
            style={{ transform: `translate(${item.x * 100}cqw, ${item.y * 100}cqh) translate(-50%, -50%) scale(${item.scale})` }}
            onTouchStart={(e) => onItemTouchStart(e, item)}
            onTouchMove={onItemTouchMove}
            onTouchEnd={() => onItemTouchEnd(item)}
            onPointerDown={(e) => onItemPointerDown(e, item)}
            onPointerMove={onItemPointerMove}
            onPointerUp={(e) => { if (e.pointerType !== "touch") { gesture.current = null; } }}
          >
            {item.kind === "poll" && item.poll ? (
              <PollPreview question={item.poll.question} options={item.poll.options} />
            ) : (
              <span
                className={cn(
                  "block max-w-[80cqw] whitespace-pre-wrap text-center font-bold leading-tight",
                  isSticker(item.kind) ? "rounded-xl bg-white px-3 py-1.5 text-[17px] text-neutral-900 shadow-lg" : "text-[26px]",
                  item.kind === "mention" && "text-[#e8552b]",
                  item.kind === "text" && item.pill && "rounded-xl px-3 py-1",
                  item.kind === "text" && !item.pill && "[text-shadow:0_1px_6px_rgba(0,0,0,0.45)]",
                )}
                style={item.kind === "text" ? (item.pill ? { background: item.color, color: readableOn(item.color) } : { color: item.color }) : undefined}
              >
                {itemLabel(item)}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Top: close, and the tools. */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent px-2 pb-6 pt-[calc(env(safe-area-inset-top)+0.25rem)]">
        <button type="button" onClick={onCancel} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30" aria-label="Discard story">
          <X className="h-6 w-6" />
        </button>
        <div className="flex items-center gap-1.5">
          {mode === "draw" ? (
            <>
              <button type="button" onClick={() => setStrokes((l) => l.slice(0, -1))} disabled={!strokes.length} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 disabled:opacity-40" aria-label="Undo">
                <Undo2 className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setMode("move")} className="h-11 rounded-full bg-white px-4 text-sm font-semibold text-black">Done</button>
            </>
          ) : (
            <>
              <ToolButton label="Add text" onClick={() => setTyping({ id: uid(), kind: "text", x: 0.5, y: 0.45, scale: 1, text: "", color: "#ffffff", pill: false })}><Type className="h-5 w-5" /></ToolButton>
              <ToolButton label="Draw" onClick={() => setMode("draw")}><PenLine className="h-5 w-5" /></ToolButton>
              <ToolButton label="Stickers" onClick={() => setStickerSheet("menu")}><Smile className="h-5 w-5" /></ToolButton>
            </>
          )}
        </div>
      </div>

      {/* Drawing: pen colours and size. */}
      {mode === "draw" && (
        <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black/60 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
          <Swatches value={penColor} onChange={setPenColor} />
          <label className="flex items-center gap-3 text-xs">
            <span className="w-10">Size</span>
            <input type="range" min={3} max={24} value={penSize} onChange={(e) => setPenSize(Number(e.target.value))} className="flex-1 accent-white" aria-label="Pen size" />
          </label>
        </div>
      )}

      {/* Bottom: the bin while dragging, else backgrounds (text stories) and Share. */}
      {mode === "move" && !typing && (
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/60 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
          {dragging ? (
            <div ref={binRef} className={cn("mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 transition-transform", overBin ? "scale-125 border-red-500 bg-red-500" : "border-white/80 bg-black/40")} aria-label="Drop here to remove">
              <Trash2 className="h-6 w-6" />
            </div>
          ) : (
            <>
              {!img ? (
                <div className="flex gap-2" role="radiogroup" aria-label="Background">
                  {STORY_BACKGROUNDS.map((bg) => (
                    <button key={bg} type="button" role="radio" aria-checked={bg === background} aria-label="Background colour" onClick={() => setBackground(bg)}
                      className={cn("h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-black", bg === background ? "ring-white" : "ring-transparent")} style={{ background: bg }} />
                  ))}
                </div>
              ) : <span />}
              <button type="button" onClick={save} disabled={!canShare || saving} className="flex h-12 items-center gap-2 rounded-full bg-white px-5 text-[15px] font-semibold text-black disabled:opacity-50">
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />} Next
              </button>
            </>
          )}
        </div>
      )}

      {/* Typing text: big, centred, with colours and a pill style. */}
      {typing && (
        <div className="absolute inset-0 z-10 flex flex-col bg-black/60 backdrop-blur-[2px]">
          <div className="flex items-center justify-between px-2 pt-[calc(env(safe-area-inset-top)+0.25rem)]">
            <button type="button" onClick={() => setTyping((t) => (t ? { ...t, pill: !t.pill } : t))} className="h-11 rounded-full bg-black/30 px-4 text-sm font-semibold" aria-pressed={typing.pill}>
              {typing.pill ? "Plain" : "Highlight"}
            </button>
            <button type="button" onClick={finishTyping} className="h-11 rounded-full bg-white px-5 text-sm font-semibold text-black">Done</button>
          </div>
          <div className="flex flex-1 items-center justify-center px-6">
            <textarea
              ref={typingRef}
              value={typing.text}
              onChange={(e) => setTyping((t) => (t ? { ...t, text: e.target.value.slice(0, 200) } : t))}
              placeholder="Type something…"
              rows={3}
              aria-label="Story text"
              className={cn("w-full resize-none bg-transparent text-center text-[28px] font-bold leading-tight outline-none placeholder:text-white/50", typing.pill && "rounded-xl px-3 py-1")}
              style={typing.pill ? { background: typing.color, color: readableOn(typing.color) } : { color: typing.color }}
            />
          </div>
          <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Swatches value={typing.color} onChange={(c) => setTyping((t) => (t ? { ...t, color: c } : t))} />
          </div>
        </div>
      )}

      {stickerSheet && (
        <StickerSheet
          view={stickerSheet}
          onView={setStickerSheet}
          currentUserId={currentUserId}
          canPoll={features.storyStickers && !hasPoll}
          canMention={features.storyStickers}
          onAdd={addItem}
        />
      )}
    </div>,
    document.body,
  );
};

const ToolButton = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30" aria-label={label} title={label}>
    {children}
  </button>
);

const Swatches = ({ value, onChange }: { value: string; onChange: (c: string) => void }) => (
  <div className="flex justify-center gap-2.5" role="radiogroup" aria-label="Colour">
    {COLORS.map((c) => (
      <button key={c} type="button" role="radio" aria-checked={c === value} aria-label={`Colour ${c}`} onClick={() => onChange(c)}
        className={cn("h-8 w-8 rounded-full border-2 border-white/80 transition-transform", c === value && "scale-125")} style={{ background: c }} />
    ))}
  </div>
);

/** The poll as it looks on the story (votes come in the viewer). */
const PollPreview = ({ question, options }: { question: string; options: string[] }) => (
  <div className="w-[64cqw] max-w-[300px] rounded-2xl bg-white p-3 text-center text-neutral-900 shadow-xl">
    <p className="mb-2 text-[16px] font-bold leading-snug">{question}</p>
    <div className="space-y-1.5">
      {options.map((o, i) => (
        <div key={i} className="rounded-xl bg-neutral-100 px-3 py-2 text-[15px] font-semibold">{o}</div>
      ))}
    </div>
  </div>
);

type AddItem = (item: { kind: Kind; text: string; mention?: Item["mention"]; poll?: Item["poll"] }) => void;

const StickerSheet = ({ view, onView, currentUserId, canPoll, canMention, onAdd }: {
  view: "menu" | "place" | "mention" | "poll";
  onView: (v: null | "menu" | "place" | "mention" | "poll") => void;
  currentUserId: string;
  canPoll: boolean;
  canMention: boolean;
  onAdd: AddItem;
}) => {
  const [place, setPlace] = useState("");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["Yes", "No"]);
  const [friends, setFriends] = useState<{ id: string; full_name: string | null; avatar_url: string | null }[] | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (view !== "mention" || friends) return;
    (async () => {
      const { data: links } = await supabase.from("friendships").select("user_id, friend_id").or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`).eq("status", "accepted");
      const ids = (links ?? []).map((f) => (f.user_id === currentUserId ? f.friend_id : f.user_id));
      const { data } = ids.length ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids) : { data: [] };
      setFriends(data ?? []);
    })();
  }, [view, friends, currentUserId]);
  const shown = useMemo(() => (friends ?? []).filter((f) => (f.full_name ?? "").toLowerCase().includes(search.trim().toLowerCase())).slice(0, 30), [friends, search]);

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/50" onClick={() => onView(null)}>
      <div className="max-h-[75dvh] overflow-y-auto rounded-t-3xl bg-neutral-900 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-300" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-white/25" aria-hidden="true" />
        {view === "menu" && (
          <div className="grid grid-cols-2 gap-2">
            <SheetChoice icon={<Clock className="h-5 w-5" />} label="Time" onClick={() => onAdd({ kind: "time", text: timeLabel() })} />
            <SheetChoice icon={<MapPin className="h-5 w-5" />} label="Location" onClick={() => onView("place")} />
            {canMention && <SheetChoice icon={<AtSign className="h-5 w-5" />} label="Mention" onClick={() => onView("mention")} />}
            {canPoll && <SheetChoice icon={<BarChart3 className="h-5 w-5" />} label="Poll" onClick={() => onView("poll")} />}
          </div>
        )}
        {view === "place" && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (place.trim()) onAdd({ kind: "place", text: place.trim().slice(0, 40) }); }}>
            <p className="text-[15px] font-semibold">Where are you?</p>
            <input autoFocus value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Lekki, Lagos" aria-label="Place" className="h-12 w-full rounded-xl bg-white/10 px-4 text-[16px] outline-none placeholder:text-white/40" />
            <button type="submit" disabled={!place.trim()} className="h-12 w-full rounded-full bg-white font-semibold text-black disabled:opacity-50">Add</button>
          </form>
        )}
        {view === "mention" && (
          <div className="space-y-2">
            <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search friends" aria-label="Search friends" className="h-11 w-full rounded-xl bg-white/10 px-4 text-[16px] outline-none placeholder:text-white/40" />
            {friends === null ? <Loader2 className="mx-auto my-4 h-6 w-6 animate-spin" /> : shown.length === 0 ? (
              <p className="py-4 text-center text-sm text-white/60">No friends found</p>
            ) : shown.map((f) => (
              <button key={f.id} type="button" onClick={() => onAdd({ kind: "mention", text: (f.full_name || "Friend").split(" ")[0], mention: { id: f.id, name: f.full_name || "Friend" } })} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/10">
                <Avatar className="h-10 w-10"><AvatarImage src={f.avatar_url || undefined} className="object-cover" /><AvatarFallback className="bg-white/10">{f.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback></Avatar>
                <span className="font-semibold">{f.full_name || "Friend"}</span>
              </button>
            ))}
          </div>
        )}
        {view === "poll" && (
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault();
            const opts = options.map((o) => o.trim()).filter(Boolean);
            if (question.trim() && opts.length >= 2) onAdd({ kind: "poll", text: question.trim(), poll: { question: question.trim().slice(0, 80), options: opts.slice(0, 4).map((o) => o.slice(0, 30)) } });
          }}>
            <input autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question…" aria-label="Poll question" className="h-12 w-full rounded-xl bg-white/10 px-4 text-[16px] font-semibold outline-none placeholder:text-white/40" />
            {options.map((o, i) => (
              <input key={i} value={o} onChange={(e) => setOptions((l) => l.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} aria-label={`Option ${i + 1}`} className="h-11 w-full rounded-xl bg-white/10 px-4 text-[16px] outline-none placeholder:text-white/40" />
            ))}
            {options.length < 4 && <button type="button" onClick={() => setOptions((l) => [...l, ""])} className="text-sm font-semibold text-white/80">+ Add an option</button>}
            <button type="submit" disabled={!question.trim() || options.filter((o) => o.trim()).length < 2} className="h-12 w-full rounded-full bg-white font-semibold text-black disabled:opacity-50">Add poll</button>
          </form>
        )}
      </div>
    </div>
  );
};

const SheetChoice = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
  <button type="button" onClick={onClick} className="flex h-14 items-center gap-3 rounded-2xl bg-white/10 px-4 text-[15px] font-semibold hover:bg-white/15">
    {icon} {label}
  </button>
);

// ---- Painting (screen and saved picture share these) ----
function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number, sizeScale = devicePixelRatio) {
  if (!s.points.length) return;
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.size * sizeScale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(s.points[0].x * w, s.points[0].y * h);
  for (const p of s.points.slice(1)) ctx.lineTo(p.x * w, p.y * h);
  if (s.points.length === 1) ctx.lineTo(s.points[0].x * w + 0.1, s.points[0].y * h);
  ctx.stroke();
}

function paintGradient(ctx: CanvasRenderingContext2D, css: string) {
  const colors = css.match(/#[0-9a-f]{6}/gi) ?? ["#e8552b"];
  const g = ctx.createLinearGradient(0, 0, OUT_W * 0.35, OUT_H);
  colors.forEach((c, i) => g.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, OUT_W, OUT_H);
}

function paintItem(ctx: CanvasRenderingContext2D, item: Item, unit: number) {
  const sticker = isSticker(item.kind);
  const size = (sticker ? 17 : 26) * unit * item.scale;
  ctx.font = `700 ${size}px "Figtree Variable", Figtree, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrap(ctx, itemLabel(item), OUT_W * 0.8);
  const lineH = size * 1.2;
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const cx = item.x * OUT_W, cy = item.y * OUT_H;
  const top = cy - (lines.length * lineH) / 2;
  const padX = (sticker ? 12 : 12) * unit * item.scale, padY = (sticker ? 6 : 4) * unit * item.scale;
  if (sticker || item.pill) {
    ctx.fillStyle = sticker ? "#ffffff" : item.color;
    roundRect(ctx, cx - width / 2 - padX, top - padY, width + padX * 2, lines.length * lineH + padY * 2, 12 * unit * item.scale);
    ctx.fill();
  }
  ctx.fillStyle = sticker ? (item.kind === "mention" ? "#e8552b" : "#171717") : item.pill ? readableOn(item.color) : item.color;
  if (!sticker && !item.pill) { ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 6 * unit; }
  lines.forEach((l, i) => ctx.fillText(l, cx, top + lineH * (i + 0.5)));
  ctx.shadowBlur = 0;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > max && line) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Black or white text, whichever reads on this colour. */
function readableOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 160 ? "#111111" : "#ffffff";
}

export default StoryEditor;
