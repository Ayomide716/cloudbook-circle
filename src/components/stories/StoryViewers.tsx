import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, X } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";

interface Viewer {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  viewed_at: string;
}

/** Who watched one of your stories, newest first (only you can read this list). */
async function loadViewers(storyId: string, ownerId: string): Promise<Viewer[]> {
  const { data: views } = await supabase
    .from("story_views")
    .select("viewer_id, viewed_at")
    .eq("story_id", storyId)
    .neq("viewer_id", ownerId)
    .order("viewed_at", { ascending: false })
    .limit(200);
  if (!views?.length) return [];
  const { data: people } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", views.map((v) => v.viewer_id));
  const byId = new Map((people ?? []).map((p) => [p.id, p]));
  return views.flatMap((v) => {
    const p = byId.get(v.viewer_id);
    return p ? [{ ...p, viewed_at: v.viewed_at }] : [];
  });
}

interface StoryViewersProps {
  storyId: string;
  ownerId: string;
  /** Opening the list pauses the story; closing it plays on. */
  onOpenChange: (open: boolean) => void;
}

/**
 * On your own story: "Seen by 12" at the bottom; tap (or swipe up) for the list of people,
 * as on Facebook and Instagram.
 */
const StoryViewers = ({ storyId, ownerId, onOpenChange }: StoryViewersProps) => {
  const [viewers, setViewers] = useState<Viewer[] | null>(null);
  const [open, setOpen] = useState(false);
  const touchY = useRef(0);

  useEffect(() => {
    setViewers(null);
    let live = true;
    void loadViewers(storyId, ownerId).then((v) => live && setViewers(v));
    return () => { live = false; };
  }, [storyId, ownerId]);

  const show = (o: boolean) => {
    setOpen(o);
    onOpenChange(o);
  };

  return (
    <>
      <div className="absolute bottom-0 left-0 right-0 z-20 flex justify-center bg-gradient-to-t from-black/70 to-transparent p-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
        <button
          type="button"
          onClick={() => show(true)}
          onTouchStart={(e) => { touchY.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => { if (touchY.current - e.changedTouches[0].clientY > 30) show(true); }}
          className="flex items-center gap-2 rounded-full bg-black/40 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm"
        >
          <Eye className="h-4 w-4" />
          {viewers === null ? "Seen by …" : viewers.length === 0 ? "No views yet" : `Seen by ${viewers.length}`}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[105] flex items-end bg-black/40" onClick={() => show(false)}>
          <div
            role="dialog"
            aria-label="Story viewers"
            className="max-h-[70vh] w-full overflow-y-auto rounded-t-3xl bg-card pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] text-foreground animate-in slide-in-from-bottom duration-200 sm:mx-auto sm:max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <p className="font-semibold">{viewers?.length ? `${viewers.length} ${viewers.length === 1 ? "viewer" : "viewers"}` : "Viewers"}</p>
              <button type="button" onClick={() => show(false)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>
            {viewers?.length ? (
              <ul>
                {viewers.map((v) => (
                  <li key={v.id}>
                    <Link to={`/profile/${v.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/60">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={v.avatar_url || undefined} alt="" />
                        <AvatarFallback>{v.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate font-medium">{v.full_name || "Someone"}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNowStrict(new Date(v.viewed_at))}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {viewers === null ? "Loading…" : "Nobody has seen this story yet."}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default StoryViewers;
