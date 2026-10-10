 import { useState, useEffect } from "react";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Smile, Search, Loader2, X } from "lucide-react";
 import {
   Popover,
   PopoverContent,
   PopoverTrigger,
 } from "@/components/ui/popover";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { motion } from "framer-motion";
 import { cn } from "@/lib/utils";
 import { STICKER_PACKS, stickerName, stickerUrl } from "@/lib/stickers";
 
 interface GifPickerProps {
   /** An emoji to add to the text, or a GIF's URL to attach. */
   onSelect: (url: string) => void;
   /** Send a sticker straight away (a sticker is a message of its own). Without it, no Stickers tab. */
   onSticker?: (id: string) => void;
 }
 
 // GIF search uses Tenor, falling back to Giphy. These are public client keys
 // (they ship to the browser); set VITE_TENOR_API_KEY / VITE_GIPHY_API_KEY in .env to override.
 const TENOR_API_KEY = import.meta.env.VITE_TENOR_API_KEY || "AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ";
 const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY || "0UTRbFtkMxAplrohufYco5IY74U8hOes";

 interface TenorSearchResponse {
   results?: { media_formats?: { gif?: { url?: string }; tinygif?: { url?: string } } }[];
 }

 interface GiphySearchResponse {
   data?: { images: { fixed_height: { url: string } } }[];
 }

 // Emoji go into the text you're typing (the Stickers tab sends a big 3D sticker instead).
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
 
 const GifPicker = ({ onSelect, onSticker }: GifPickerProps) => {
   const [open, setOpen] = useState(false);
   const [search, setSearch] = useState("");
   const [gifs, setGifs] = useState<string[]>([]);
   const [loading, setLoading] = useState(false);
   const [activeTab, setActiveTab] = useState<"emoji" | "stickers" | "gifs">(onSticker ? "stickers" : "emoji");
   const [pack, setPack] = useState(STICKER_PACKS[0].id);
   const [recent, setRecent] = useState<string[]>(readRecent);
 
  const searchGifs = async (query: string) => {
    if (!query.trim()) {
      setGifs([]);
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(
        `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_API_KEY}&client_key=cloudbook&limit=20`
      );
      if (!response.ok) throw new Error(`Tenor search failed (${response.status})`);
      const data: TenorSearchResponse = await response.json();
      const gifUrls = (data.results ?? [])
        .map((gif) => gif.media_formats?.gif?.url || gif.media_formats?.tinygif?.url)
        .filter((url): url is string => !!url);
      setGifs(gifUrls);
    } catch (error) {
      console.error("Failed to fetch GIFs:", error);
      // Fallback: try Giphy
      try {
        const response = await fetch(
          `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=20&rating=g`
        );
        const data: GiphySearchResponse = await response.json();
        const gifUrls = (data.data ?? []).map((gif) => gif.images.fixed_height.url);
        setGifs(gifUrls);
      } catch {
        setGifs([]);
      }
    }
    setLoading(false);
  };
 
   useEffect(() => {
     const debounce = setTimeout(() => {
       if (activeTab === 'gifs') {
         searchGifs(search);
       }
     }, 300);
     return () => clearTimeout(debounce);
   }, [search, activeTab]);
 
   const handleSelectGif = (url: string) => {
     onSelect(url);
     setOpen(false);
     setSearch("");
     setGifs([]);
   };
 
   const handleSelectEmoji = (emoji: string) => {
     onSelect(emoji);
     setOpen(false);
   };
 
   const handleSendSticker = (id: string) => {
     onSticker?.(id);
     setOpen(false);
     const next = [id, ...recent.filter((r) => r !== id)].slice(0, 8);
     setRecent(next);
     try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* fine */ }
   };
 
   const tabs = [
     ...(onSticker ? [["stickers", "Stickers"] as const] : []),
     ["emoji", "Emoji"] as const,
     ["gifs", "GIFs"] as const,
   ];
   const currentPack = STICKER_PACKS.find((p) => p.id === pack) ?? STICKER_PACKS[0];
 
   return (
     <Popover open={open} onOpenChange={setOpen}>
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
               onClick={() => setActiveTab(value)}
               className={cn("relative h-8 flex-1 rounded-full text-[13px] font-semibold transition-colors", activeTab === value ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
             >
               {activeTab === value && <motion.span layoutId="picker-tab" className="absolute inset-0 rounded-full bg-background shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
               <span className="relative">{label}</span>
             </button>
           ))}
         </div>
 
         {activeTab === "gifs" && (
           <div className="px-2 pb-2">
             <div className="relative">
               <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
               <Input
                 placeholder="Search GIFs"
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
           </div>
         )}
 
         <ScrollArea className="h-72">
           {activeTab === "stickers" ? (
             <div className="px-2 pb-2">
               {recent.length > 0 && (
                 <>
                   <p className="px-1.5 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent</p>
                   <div className="mb-2 grid grid-cols-4 gap-1">
                     {recent.map((id) => (
                       <StickerButton key={`r-${id}`} id={id} onPick={handleSendSticker} />
                     ))}
                   </div>
                 </>
               )}
               <p className="px-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{currentPack.label}</p>
               <div className="grid grid-cols-4 gap-1">
                 {currentPack.stickers.map(([id]) => (
                   <StickerButton key={id} id={id} onPick={handleSendSticker} />
                 ))}
               </div>
             </div>
           ) : activeTab === "emoji" ? (
             <div className="grid grid-cols-8 gap-0.5 px-2 pb-2">
               {EMOJI.map((emoji) => (
                 <button
                   key={emoji}
                   type="button"
                   onClick={() => handleSelectEmoji(emoji)}
                   className="flex aspect-square items-center justify-center rounded-xl text-[24px] transition-transform hover:scale-110 hover:bg-accent active:scale-95"
                 >
                   {emoji}
                 </button>
               ))}
             </div>
           ) : (
             <div className="px-2 pb-2">
               {loading ? (
                 <div className="flex items-center justify-center py-8">
                   <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                 </div>
               ) : gifs.length > 0 ? (
                 <div className="grid grid-cols-2 gap-1.5">
                   {gifs.map((gif, i) => (
                     <button
                       key={i}
                       type="button"
                       onClick={() => handleSelectGif(gif)}
                       className="overflow-hidden rounded-xl transition-opacity hover:opacity-80"
                     >
                       <img src={gif} alt="GIF" className="h-24 w-full object-cover" />
                     </button>
                   ))}
                 </div>
               ) : (
                 <p className="py-8 text-center text-sm text-muted-foreground">{search ? "No GIFs found" : "Search for a GIF above"}</p>
               )}
             </div>
           )}
         </ScrollArea>
 
         {/* Sticker packs, along the bottom as in WhatsApp */}
         {activeTab === "stickers" && (
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
         )}
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