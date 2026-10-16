import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import StorySlides, { type Slide } from "./StorySlides";

interface Highlight {
  id: string;
  title: string;
  slides: Slide[];
}

/** A highlight's cover: its first story, small and round. */
const Cover = ({ slide }: { slide?: Slide }) =>
  !slide ? (
    <span className="h-full w-full bg-muted" />
  ) : slide.media_type === "video" ? (
    <video src={`${slide.media_url}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
  ) : (
    <img src={slide.media_url} alt="" loading="lazy" className="h-full w-full object-cover" />
  );

/**
 * Story highlights under a profile's header, as on Facebook and Instagram: round covers with a
 * title; tap to play. On your own profile, "New" picks stories from your archive.
 */
const StoryHighlights = ({ userId, isOwn }: { userId: string; isOwn: boolean }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [playing, setPlaying] = useState<Highlight | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("story_highlights")
      .select("id, title, story_ids")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    // Before the database update, there's simply nothing to show.
    if (error || !data?.length) { setHighlights([]); return; }
    const ids = [...new Set(data.flatMap((h) => h.story_ids))];
    const { data: stories } = ids.length
      ? await supabase.from("stories").select("id, media_url, media_type, caption, created_at").in("id", ids)
      : { data: [] };
    const byId = new Map((stories ?? []).map((s) => [s.id, s]));
    setHighlights(
      data
        .map((h) => ({ id: h.id, title: h.title, slides: h.story_ids.flatMap((id) => byId.get(id) ?? []) }))
        .filter((h) => h.slides.length > 0)
    );
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const remove = async (h: Highlight) => {
    const { error } = await supabase.from("story_highlights").delete().eq("id", h.id);
    if (error) { toast({ title: "Couldn't delete it", variant: "destructive" }); return; }
    setPlaying(null);
    setHighlights((all) => all.filter((x) => x.id !== h.id));
    toast({ title: "Highlight deleted" });
  };

  if (!isOwn && highlights.length === 0) return null;

  // Your own profile with no highlights yet: a small link, not a row with one empty circle.
  if (highlights.length === 0) {
    return (
      <button type="button" onClick={() => navigate("/story-archive?highlight=1")} className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-primary">
        <Plus className="h-4 w-4" /> Add story highlights
      </button>
    );
  }

  return (
    <div className="mt-4 -mx-4 flex gap-4 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:px-0">
      {isOwn && (
        <button type="button" onClick={() => navigate("/story-archive?highlight=1")} className="flex w-16 shrink-0 flex-col items-center gap-1">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-border bg-secondary">
            <Plus className="h-6 w-6" />
          </span>
          <span className="text-xs font-medium">New</span>
        </button>
      )}
      {highlights.map((h) => (
        <button key={h.id} type="button" onClick={() => setPlaying(h)} className="flex w-16 shrink-0 flex-col items-center gap-1">
          <span className="h-16 w-16 overflow-hidden rounded-full border-2 border-background ring-2 ring-border">
            <Cover slide={h.slides[0]} />
          </span>
          <span className="w-full truncate text-center text-xs font-medium">{h.title}</span>
        </button>
      ))}
      {playing && (
        <StorySlides
          title={playing.title}
          slides={playing.slides}
          onClose={() => setPlaying(null)}
          onDelete={isOwn ? () => void remove(playing) : undefined}
        />
      )}
    </div>
  );
};

export default StoryHighlights;
