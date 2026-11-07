import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { History, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { onThisDayRanges, yearsAgo } from "@/lib/memories";
import { plainMentions } from "@/lib/mentions";

interface Memory { id: string; content: string | null; image_url: string | null; created_at: string | null }

const HIDE_KEY = "ember:memories-hidden";
const today = () => new Date().toDateString();

/** "On this day": something you posted on this date in an earlier year, at the top of Home. */
const MemoriesCard = ({ currentUserId }: { currentUserId: string }) => {
  const navigate = useNavigate();
  const [memory, setMemory] = useState<Memory | null>(null);
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(HIDE_KEY) === today(); } catch { return false; }
  });

  useEffect(() => {
    if (hidden) return;
    const ranges = onThisDayRanges(new Date());
    if (!ranges.length) return;
    let cancelled = false;
    supabase
      .from("posts")
      .select("id, content, image_url, created_at")
      .eq("user_id", currentUserId)
      .or(ranges.map((r) => `and(created_at.gte.${r.from},created_at.lt.${r.to})`).join(","))
      .order("created_at", { ascending: true }) // the oldest memory first
      .limit(5)
      .then(({ data }) => {
        if (cancelled || !data?.length) return;
        // A post with a photo makes the better memory.
        setMemory(data.find((p) => p.image_url) ?? data[0]);
      });
    return () => { cancelled = true; };
  }, [currentUserId, hidden]);

  if (hidden || !memory) return null;
  const when = new Date(memory.created_at ?? Date.now());
  const close = () => {
    try { localStorage.setItem(HIDE_KEY, today()); } catch { /* not remembered */ }
    setHidden(true);
  };
  const text = plainMentions(memory.content ?? "").trim();

  return (
    <section aria-label="On this day" className="feed-section relative border border-border/60 bg-card p-3 sm:rounded-2xl">
      <div className="mb-2 flex items-center gap-2 pr-7">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <History className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-tight">On this day</p>
          <p className="text-xs text-muted-foreground">{yearsAgo(when.getFullYear(), new Date())}</p>
        </div>
      </div>
      <button type="button" onClick={() => navigate(`/post/${memory.id}`)} className="flex w-full items-center gap-3 rounded-xl bg-secondary/60 p-2 text-left hover:bg-secondary">
        {memory.image_url && <img src={memory.image_url} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
        <p className="line-clamp-3 min-w-0 flex-1 text-sm">{text || "A photo you shared"}</p>
      </button>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="secondary" className="rounded-full" onClick={() => navigate(`/post/${memory.id}`)}>See memory</Button>
      </div>
      <button type="button" onClick={close} aria-label="Hide memories for today" className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent">
        <X className="h-3.5 w-3.5" />
      </button>
    </section>
  );
};

export default MemoriesCard;
