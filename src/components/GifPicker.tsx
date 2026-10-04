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
 
 interface GifPickerProps {
   onSelect: (url: string) => void;
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

 const STICKERS = [
   "👍", "❤️", "😂", "😢", "😮", "😡", "🎉", "🔥",
   "👏", "💪", "🙏", "💯", "✨", "🌟", "💕", "😍",
   "🤔", "😎", "🥺", "😭", "🤣", "😊", "🥰", "😘",
   "🙌", "👀", "💀", "🤷", "🤦", "👋", "✌️", "🤝"
 ];
 
 const GifPicker = ({ onSelect }: GifPickerProps) => {
   const [open, setOpen] = useState(false);
   const [search, setSearch] = useState("");
   const [gifs, setGifs] = useState<string[]>([]);
   const [loading, setLoading] = useState(false);
   const [activeTab, setActiveTab] = useState<'stickers' | 'gifs'>('stickers');
 
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
 
   const handleSelectSticker = (sticker: string) => {
     onSelect(sticker);
     setOpen(false);
   };
 
   return (
     <Popover open={open} onOpenChange={setOpen}>
       <PopoverTrigger asChild>
         <Button variant="ghost" size="icon" className="h-9 w-9">
           <Smile className="h-5 w-5 text-muted-foreground" />
         </Button>
       </PopoverTrigger>
       <PopoverContent className="w-80 p-0" align="end">
         <div className="flex border-b">
           <button
             onClick={() => setActiveTab('stickers')}
             className={`flex-1 py-2 text-sm font-medium transition-colors ${
               activeTab === 'stickers' 
                 ? 'text-primary border-b-2 border-primary' 
                 : 'text-muted-foreground hover:text-foreground'
             }`}
           >
             Stickers
           </button>
           <button
             onClick={() => setActiveTab('gifs')}
             className={`flex-1 py-2 text-sm font-medium transition-colors ${
               activeTab === 'gifs' 
                 ? 'text-primary border-b-2 border-primary' 
                 : 'text-muted-foreground hover:text-foreground'
             }`}
           >
             GIFs
           </button>
         </div>
 
         {activeTab === 'gifs' && (
           <div className="p-2 border-b">
             <div className="relative">
               <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
               <Input
                 placeholder="Search GIFs..."
                 value={search}
                 onChange={(e) => setSearch(e.target.value)}
                 className="pl-8 h-8"
               />
               {search && (
                 <Button
                   variant="ghost"
                   size="icon"
                   className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                   onClick={() => setSearch("")}
                 >
                   <X className="h-3 w-3" />
                 </Button>
               )}
             </div>
           </div>
         )}
 
         <ScrollArea className="h-64">
           {activeTab === 'stickers' ? (
             <div className="grid grid-cols-8 gap-1 p-2">
               {STICKERS.map((sticker, i) => (
                 <button
                   key={i}
                   onClick={() => handleSelectSticker(sticker)}
                   className="p-2 text-2xl hover:bg-accent rounded-md transition-colors"
                 >
                   {sticker}
                 </button>
               ))}
             </div>
           ) : (
             <div className="p-2">
               {loading ? (
                 <div className="flex items-center justify-center py-8">
                   <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                 </div>
               ) : gifs.length > 0 ? (
                 <div className="grid grid-cols-2 gap-2">
                   {gifs.map((gif, i) => (
                     <button
                       key={i}
                       onClick={() => handleSelectGif(gif)}
                       className="overflow-hidden rounded-lg hover:opacity-80 transition-opacity"
                     >
                       <img src={gif} alt="GIF" className="w-full h-24 object-cover" />
                     </button>
                   ))}
                 </div>
               ) : search ? (
                 <p className="text-center text-muted-foreground py-8 text-sm">
                   No GIFs found
                 </p>
               ) : (
                 <p className="text-center text-muted-foreground py-8 text-sm">
                   Search for GIFs above
                 </p>
               )}
             </div>
           )}
         </ScrollArea>
       </PopoverContent>
     </Popover>
   );
 };
 
 export default GifPicker;