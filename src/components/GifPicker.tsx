import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Smile, Search, Loader2, X } from "@/components/icons";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { STICKER_PACKS, stickerName, stickerUrl } from "@/lib/stickers";
import { findGifs, findStickers, type GifResult } from "@/lib/giphy";

interface GifPickerProps {
  /** An emoji to add to the text, or a GIF's URL to attach. */
  onSelect: (url: string) => void;
  /** Send one of Ember's 3D stickers straight away (a sticker is a message of its own). Without it, no Stickers tab. */
  onSticker?: (id: string) => void;
  /** Send an animated GIPHY sticker straight away, by its address. */
  onGiphySticker?: (url: string) => void;
}

// Emoji go into the text you're typing (the Stickers tab sends a big sticker instead).
const EMOJI = [
  "😂", "🤣", "😊", "😍", "🥰", "😘", "😎", "🤔",
  "😅", "😭", "🥺", "😢", "😮", "😡", "🙄", "😴",
  "👍", "👏", "🙌", "🙏", "💪", "👋", "✌️", "🤝",
  "❤️", "💕", "💯", "🔥", "✨", "🎉", "🌟", "👀",
  "💀", "🤷", "🤦", "😇", "🤗", "😬", "🤩", "😋",
];

const RECENT_KEY = "ember_recent_stickers";
const readRecent = (): string[] => {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && stickerName(id) !== "Sticker").slice(0, 8) : [];
  } catch {
    return [];
  }
};

type Tab = "stickers" | "emoji" | "gifs";

/**
 * The chat's smiley button: Stickers (Ember's 3D pack, or animated ones from GIPHY), Emoji
 * (into the text) and GIFs (trending as soon as it opens, or search).
 */
const GifPicker = ({ onSelect, onSticker, onGiphySticker }: GifPickerProps) => {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>(onSticker ? "stickers" : "emoji");
  const [stickerSource, setStickerSource] = useState<"ember" | "giphy">("ember");
  const [pack, setPack] = useState(STICKER_PACKS[0].id);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // What the search box and the GIPHY grid are for right now.
  const remote: "gifs" | "stickers" | null =
    activeTab === "gifs" ? "gifs" : activeTab === "stickers" && stickerSource === "giphy" ? "stickers" : null;

  // Trending as soon as the tab opens; searching as you type (after a short pause).
  useEffect(() => {
    if (!open || !remote) return;
    const controller = new AbortController();
    const t = window.setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        setResults(await (remote === "gifs" ? findGifs : findStickers)(search, controller.signal));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setResults([]);
        setFailed(true);
      }
      setLoading(false);
    }, search ? 300 : 0);
    return () => {
      controller.abort();
      window.clearTimeout(t);
      setLoading(false);
    };
  }, [open, remote, search, attempt]);

  const close = () => {
    setOpen(false);
    setSearch("");
  };

  const pickGif = (url: string) => {
    onSelect(url);
    close();
  };

  const pickEmoji = (emoji: string) => {
    onSelect(emoji);
    setOpen(false);
  };

  const sendSticker = (id: string) => {
    onSticker?.(id);
    close();
    const next = [id, ...recent.filter((r) => r !== id)].slice(0, 8);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* fine */ }
  };

  const sendGiphySticker = (url: string) => {
    onGiphySticker?.(url);
    close();
  };

  const tabs = [
    ...(onSticker ? [["stickers", "Stickers"] as const] : []),
    ["emoji", "Emoji"] as const,
    ["gifs", "GIFs"] as const,
  ];
  const currentPack = STICKER_PACKS.find((p) => p.id === pack) ?? STICKER_PACKS[0];

  const remoteGrid = (kind: "gifs" | "stickers") =>
    loading && results.length === 0 ? (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ) : results.length > 0 ? (
      <div className={cn("grid gap-1.5", kind === "gifs" ? "grid-cols-2" : "grid-cols-3")}>
        {results.map((r) => (
          <motion.button
            key={r.id}
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => (kind === "gifs" ? pickGif(r.url) : sendGiphySticker(r.url))}
            aria-label={kind === "gifs" ? `Send GIF: ${r.title}` : `Send sticker: ${r.title}`}
            className={cn(
              "overflow-hidden rounded-xl transition-opacity hover:opacity-85",
              kind === "gifs" ? "bg-secondary" : "flex aspect-square items-center justify-center p-1 hover:bg-accent"
            )}
          >
            <img src={r.preview} alt="" loading="lazy" draggable={false} className={kind === "gifs" ? "h-24 w-full object-cover" : "h-full w-full object-contain"} />
          </motion.button>
        ))}
      </div>
    ) : (
      <div className="py-10 text-center text-sm text-muted-foreground">
        <p>{failed ? "Couldn't load. Check your connection." : search ? "Nothing found" : "Nothing here yet"}</p>
        {failed && (
          <Button variant="secondary" size="sm" className="mt-3 rounded-full" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        )}
      </div>
    );

  return (
    <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Stickers, emoji and GIFs">
          <Smile className="h-5 w-5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] overflow-hidden rounded-3xl p-0" align="start" side="top" sideOffset={10}>
        {/* Stickers · Emoji · GIFs, with a sliding pill */}
        <div role="tablist" aria-label="Picker" className="m-2 flex rounded-full bg-secondary p-1">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={activeTab === value}
              onClick={() => { setActiveTab(value); setSearch(""); setResults([]); }}
              className={cn("relative h-8 flex-1 rounded-full text-[13px] font-semibold transition-colors", activeTab === value ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {activeTab === value && <motion.span layoutId="picker-tab" className="absolute inset-0 rounded-full bg-background shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>

        {/* Stickers: Ember's own 3D pack, or animated ones from GIPHY */}
        {activeTab === "stickers" && onGiphySticker && (
          <div className="mx-2 mb-2 flex gap-1.5" role="group" aria-label="Sticker source">
            {([["ember", "Ember 3D"], ["giphy", "Animated"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={stickerSource === value}
                onClick={() => { setStickerSource(value); setSearch(""); setResults([]); }}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                  stickerSource === value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {remote && (
          <div className="px-2 pb-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={remote === "gifs" ? "Search GIFs" : "Search stickers"}
                aria-label={remote === "gifs" ? "Search GIFs" : "Search stickers"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 rounded-full border-0 bg-secondary pl-9"
              />
              {search && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {!search && <p className="px-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Trending</p>}
          </div>
        )}

        <ScrollArea className="h-72">
          {remote ? (
            <div className="px-2 pb-2">{remoteGrid(remote)}</div>
          ) : activeTab === "stickers" ? (
            <div className="px-2 pb-2">
              {recent.length > 0 && (
                <>
                  <p className="px-1.5 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent</p>
                  <div className="mb-2 grid grid-cols-4 gap-1">
                    {recent.map((id) => (
                      <StickerButton key={`r-${id}`} id={id} onPick={sendSticker} />
                    ))}
                  </div>
                </>
              )}
              <p className="px-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{currentPack.label}</p>
              <div className="grid grid-cols-4 gap-1">
                {currentPack.stickers.map(([id]) => (
                  <StickerButton key={id} id={id} onPick={sendSticker} />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-8 gap-0.5 px-2 pb-2">
              {EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => pickEmoji(emoji)}
                  className="flex aspect-square items-center justify-center rounded-xl text-[24px] transition-transform hover:scale-110 hover:bg-accent active:scale-95"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Ember's packs along the bottom, as in WhatsApp; GIPHY's required credit under its results. */}
        {activeTab === "stickers" && !remote ? (
          <div className="flex gap-1 border-t border-border px-2 py-1.5">
            {STICKER_PACKS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPack(p.id)}
                aria-label={p.label}
                aria-pressed={pack === p.id}
                className={cn("flex h-9 w-9 items-center justify-center rounded-xl transition-colors", pack === p.id ? "bg-primary/15" : "hover:bg-accent")}
              >
                <img src={stickerUrl(p.stickers[0][0])} alt="" className="h-6 w-6" draggable={false} />
              </button>
            ))}
          </div>
        ) : remote ? (
          <p className="border-t border-border py-1.5 text-center text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Powered by GIPHY</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
};

/** One sticker in the grid: pops up under your finger, sends on tap. */
const StickerButton = ({ id, onPick }: { id: string; onPick: (id: string) => void }) => (
  <motion.button
    type="button"
    whileHover={{ scale: 1.12, rotate: -3 }}
    whileTap={{ scale: 0.9 }}
    onClick={() => onPick(id)}
    aria-label={`Send ${stickerName(id)} sticker`}
    title={stickerName(id)}
    className="flex aspect-square items-center justify-center rounded-2xl p-1.5 hover:bg-accent"
  >
    <img src={stickerUrl(id)} alt="" loading="lazy" draggable={false} className="h-full w-full object-contain" />
  </motion.button>
);

export default GifPicker;
