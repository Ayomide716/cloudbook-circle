import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Play, Trash2, X } from "lucide-react";
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
      <div className="page-flush mx-auto max-w-2xl space-y-2 px-0 pb-24 sm:space-y-4 sm:px-4 sm:py-6">
        <PageHeader back title="Story archive" subtitle="Only you can see your archive." />
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
                  onClick={() => setOpen(s)}
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
                  {s.media_type === "video" && <Play className="absolute bottom-2 left-2 h-5 w-5 fill-white text-white drop-shadow" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

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
