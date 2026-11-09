import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ImagePlus, Loader2 } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { haptic } from "@/lib/haptics";
import { cn, friendlyError } from "@/lib/utils";
import { hasOwnWallpaper, setWallpaper, uploadWallpaper, wallpaperFor, type Wallpaper, type WallpaperKey } from "@/lib/chat-wallpaper";

/** The photo behind a chat, darkened by its dim. Put it first inside a chat's `isolate` box. */
export const WallpaperLayer = ({ wallpaper }: { wallpaper: Wallpaper | null }) =>
  wallpaper ? (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `url("${wallpaper.url.replace(/"/g, "%22")}")` }}>
      <div className="absolute inset-0 bg-black" style={{ opacity: wallpaper.dim }} />
    </div>
  ) : null;

/**
 * Pick a photo as a chat's wallpaper (or every chat's), with a preview and how dark it is,
 * as on WhatsApp. `chatKey` "all" sets the one for every chat.
 */
const WallpaperDialog = ({ open, onOpenChange, userId, chatKey, chatName }: {
  open: boolean; onOpenChange: (open: boolean) => void; userId: string; chatKey: WallpaperKey; chatName?: string;
}) => {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dim, setDim] = useState(0.25);
  const [forAll, setForAll] = useState(chatKey === "all");
  const [saving, setSaving] = useState(false);
  const current = open ? wallpaperFor(userId, chatKey) : null;

  useEffect(() => {
    if (!open) return;
    const w = wallpaperFor(userId, chatKey);
    setFile(null);
    setPreview(w?.url ?? null);
    setDim(w?.dim ?? 0.25);
    setForAll(chatKey === "all");
  }, [open, userId, chatKey]);
  useEffect(() => () => { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  const save = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const url = file ? await uploadWallpaper(userId, file) : preview;
      setWallpaper(userId, forAll ? "all" : chatKey, { url, dim });
      // Setting it for all chats: this chat follows the new one too.
      if (forAll && chatKey !== "all" && hasOwnWallpaper(userId, chatKey)) setWallpaper(userId, chatKey, null);
      haptic(10);
      toast({ title: forAll ? "Wallpaper set for all chats" : "Wallpaper set" });
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Couldn't set the wallpaper", description: friendlyError(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    setWallpaper(userId, chatKey, null);
    toast({ title: chatKey === "all" ? "Wallpaper removed from all chats" : "Wallpaper removed" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{chatKey === "all" ? "Chat wallpaper" : `Wallpaper${chatName ? ` · ${chatName}` : ""}`}</DialogTitle></DialogHeader>
        {/* A preview, with two messages over it. */}
        <div className="relative isolate mx-auto flex h-64 w-40 flex-col justify-end gap-1.5 overflow-hidden rounded-2xl border bg-background p-2 chat-wallpaper">
          {preview && <WallpaperLayer wallpaper={{ url: preview, dim }} />}
          <span className="self-start rounded-lg rounded-tl-none bg-chat-surface px-2 py-1 text-[11px] shadow-sm">Hey! How far? 👋</span>
          <span className="self-end rounded-lg rounded-tr-none bg-chat-sent px-2 py-1 text-[11px] text-primary-foreground shadow-sm dark:text-white">I dey o, you?</span>
        </div>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setFile(f);
          setPreview(URL.createObjectURL(f));
        }} />
        <Button type="button" variant="secondary" className="w-full rounded-full" onClick={() => input.current?.click()}>
          <ImagePlus className="mr-2 h-4 w-4" /> {preview ? "Choose another photo" : "Choose a photo"}
        </Button>
        <div className={cn("space-y-2", !preview && "pointer-events-none opacity-50")}>
          <div className="flex items-center justify-between text-sm"><span>Dim</span><span className="tabular-nums text-muted-foreground">{Math.round(dim * 100)}%</span></div>
          <Slider value={[dim]} min={0} max={0.7} step={0.05} onValueChange={([v]) => setDim(v)} aria-label="Dim the wallpaper" />
        </div>
        {chatKey !== "all" && (
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Use for all my chats</span>
            <Switch checked={forAll} onCheckedChange={setForAll} />
          </label>
        )}
        <p className="text-xs text-muted-foreground">Only you see it, on this phone.</p>
        <div className="flex gap-2">
          {current && <Button type="button" variant="outline" className="flex-1 rounded-full" onClick={remove}>Remove</Button>}
          <Button type="button" className="flex-1 rounded-full" disabled={!preview || saving} onClick={() => void save()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set wallpaper"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WallpaperDialog;
