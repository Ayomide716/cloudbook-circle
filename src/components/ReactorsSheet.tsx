import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReactionEmoji from "@/components/reactions/ReactionEmoji";
import PersonRow from "@/components/PersonRow";
import { cn } from "@/lib/utils";

interface Reactor {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  reaction: string;
}

interface ReactorsSheetProps {
  postId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Who reacted to a post, with All and one tab per reaction, as on Facebook. */
const ReactorsSheet = ({ postId, open, onOpenChange }: ReactorsSheetProps) => {
  const [people, setPeople] = useState<Reactor[] | null>(null);
  const [tab, setTab] = useState<string>("all");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPeople(null);
    setTab("all");
    (async () => {
      const { data: rows } = await supabase.from("reactions").select("user_id, reaction_type, created_at").eq("post_id", postId).order("created_at", { ascending: false }).limit(200);
      const ids = [...new Set((rows ?? []).map((r) => r.user_id))];
      const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids) : { data: [] };
      if (cancelled) return;
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      setPeople((rows ?? []).filter((r) => byId.has(r.user_id)).map((r) => ({ ...byId.get(r.user_id)!, reaction: r.reaction_type })));
    })();
    return () => { cancelled = true; };
  }, [open, postId]);

  const counts = (people ?? []).reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.reaction]: (acc[p.reaction] ?? 0) + 1 }), {});
  const tabs = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const shown = (people ?? []).filter((p) => tab === "all" || p.reaction === tab);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-md max-sm:pt-5">
        <DialogHeader className="px-4 pb-2 sm:pt-5">
          <DialogTitle>Reactions</DialogTitle>
          <DialogDescription className="sr-only">People who reacted to this post.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1.5 overflow-x-auto border-b px-4 pb-2 scrollbar-hide" role="tablist" aria-label="Filter by reaction">
          {[["all", people?.length ?? 0] as const, ...tabs].map(([type, n]) => (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={tab === type}
              onClick={() => setTab(type)}
              className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors", tab === type ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary")}
            >
              {type === "all" ? "All" : <ReactionEmoji type={type} className="h-5 w-5" />}
              <span className="tabular-nums">{n}</span>
            </button>
          ))}
        </div>
        <div className="max-h-[60dvh] overflow-y-auto py-1">
          {people === null
            ? [0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2">
                  <span className="h-12 w-12 animate-pulse rounded-full bg-secondary" />
                  <span className="h-4 w-1/2 animate-pulse rounded bg-secondary" />
                </div>
              ))
            : shown.length === 0
              ? <p className="px-4 py-8 text-center text-sm text-muted-foreground">No reactions yet.</p>
              : shown.map((p) => (
                  <PersonRow
                    key={p.id}
                    id={p.id}
                    name={p.full_name}
                    avatarUrl={p.avatar_url}
                    badge={<span className="flex rounded-full bg-card ring-2 ring-card"><ReactionEmoji type={p.reaction} className="h-5 w-5" /></span>}
                  />
                ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReactorsSheet;
