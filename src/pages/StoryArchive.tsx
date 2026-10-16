import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Play, Plus, Trash2, X } from "@/components/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HeaderAction } from "@/components/layout/PageHeader";
import Navigation from "@/components/Navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/hooks/use-session";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { softImage } from "@/lib/soft-image";

interface ArchivedStory {
  id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  created_at: string;
  expires_at: string;
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/**
 * Menu → Story archive, as on Facebook: every story you've shared, kept after its 24 hours are
 * up. Only you see it.
 */
const StoryArchive = () => {
  const session = useSession();
  const userId = session?.user.id;
  const { toast } = useToast();
  const [stories, setStories] = useState<ArchivedStory[] | null>(null);
  const [open, setOpen] = useState<ArchivedStory | null>(null);
  // Making a highlight: tap stories to pick them, name it, save.
  const [params, setParams] = useSearchParams();
  const picking = params.get("highlight") === "1";
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const saveHighlight = async () => {
    if (!userId || !picked.length || !title.trim()) return;
    setSaving(true);
    // Oldest first, so the highlight plays in the order things happened.
    const order = (stories ?? []).filter((s) => picked.includes(s.id)).reverse().map((s) => s.id);
    const { error } = await supabase.from("story_highlights").insert({ user_id: userId, title: title.trim(), story_ids: order });
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save the highlight", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Highlight added to your profile" });
    navigate(`/profile/${userId}`);
  };

  useEffect(() => {
    if (!userId) return;
    void supabase
      .from("stories")
      .select("id, media_url, media_type, caption, created_at, expires_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(120)
      .then(({ data }) => setStories(data ?? []));
  }, [userId]);

  const remove = async (story: ArchivedStory) => {
    const { error } = await supabase.from("stories").delete().eq("id", story.id).eq("user_id", userId!);
    if (error) {
      toast({ title: "Couldn't delete it", variant: "destructive" });
      return;
    }
    setStories((all) => all?.filter((s) => s.id !== story.id) ?? null);
    setOpen(null);
    toast({ title: "Story deleted" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={userId} />
      <div className={`page-flush mx-auto max-w-2xl space-y-2 px-0 sm:space-y-4 sm:px-4 sm:py-6 ${picking ? "pb-44" : "pb-24"}`}>
        <PageHeader
          back
          title={picking ? "New highlight" : "Story archive"}
          subtitle={picking ? "Pick the stories to keep on your profile." : "Only you can see your archive."}
          actions={!picking && stories?.length ? <HeaderAction icon={Plus} label="New highlight" onClick={() => setParams({ highlight: "1" })} /> : undefined}
        />
        {stories === null ? (
          <div className="grid grid-cols-3 gap-0.5 sm:gap-1" aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-[9/16] rounded-none" />)}
          </div>
        ) : stories.length === 0 ? (
          <EmptyState emoji="camera" title="No stories yet" text="Stories you share stay here after they disappear from the stories row." />
        ) : (
          <div className="grid grid-cols-3 gap-0.5 overflow-hidden sm:gap-1 sm:rounded-xl">
            {stories.map((s) => {
              const live = new Date(s.expires_at) > new Date();
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => (picking ? togglePick(s.id) : setOpen(s))}
                  aria-pressed={picking ? picked.includes(s.id) : undefined}
                  aria-label={`Story from ${day(s.created_at)}`}
                  className="no-press relative aspect-[9/16] overflow-hidden bg-muted"
                >
                  {s.media_type === "video" ? (
                    <video src={`${s.media_url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
                  ) : (
                    <img src={s.media_url} alt="" loading="lazy" {...softImage} className={`${softImage.className} h-full w-full object-cover`} />
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-white/95 px-1.5 py-0.5 text-[11px] font-bold leading-tight text-black">
                    {day(s.created_at)}
                  </span>
                  {live && <span className="absolute right-1.5 top-1.5 rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">Live</span>}
                  {picking && (
                    <span className={`absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white ${picked.includes(s.id) ? "bg-primary" : "bg-black/30"}`}>
                      {picked.includes(s.id) && <Check className="h-4 w-4 text-primary-foreground" />}
                    </span>
                  )}
                  {s.media_type === "video" && <Play className="absolute bottom-2 left-2 h-5 w-5 fill-white text-white drop-shadow" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {picking && (
        <div className="fixed inset-x-0 bottom-[var(--dock-space,0px)] z-40 border-t border-border bg-card p-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 30))} placeholder="Name it, e.g. Lagos 🌴" aria-label="Highlight name" className="h-10 flex-1 rounded-full" />
            <Button onClick={() => void saveHighlight()} disabled={saving || !picked.length || !title.trim()} className="h-10 rounded-full">
              Save{picked.length ? ` (${picked.length})` : ""}
            </Button>
          </div>
        </div>
      )}

      <DialogPrimitive.Root open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black" />
          <DialogPrimitive.Content className="fixed inset-0 z-50 flex flex-col bg-black text-white outline-none">
            <DialogPrimitive.Title className="sr-only">Story</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">A story from your archive</DialogPrimitive.Description>
            {open && (
              <>
                <div className="flex h-14 shrink-0 items-center justify-between px-2 pt-[env(safe-area-inset-top)]">
                  <DialogPrimitive.Close className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Close">
                    <X className="h-6 w-6" />
                  </DialogPrimitive.Close>
                  <span className="text-sm font-semibold">
                    {new Date(open.created_at).toLocaleString(undefined, { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                  <button type="button" onClick={() => void remove(open)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Delete story">
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center">
                  {open.media_type === "video" ? (
                    <video src={open.media_url} controls autoPlay playsInline className="max-h-full max-w-full object-contain" />
                  ) : (
                    <img src={open.media_url} alt="" className="max-h-full max-w-full object-contain" />
                  )}
                </div>
                {open.caption && <p className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-center text-sm text-white/90">{open.caption}</p>}
              </>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
};

export default StoryArchive;
