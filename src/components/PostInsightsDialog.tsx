import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReactionEmoji from "@/components/reactions/ReactionEmoji";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Share2, Users } from "@/components/icons";

interface Insights {
  reactions: Record<string, number>;
  comments: number;
  shares: number;
  people: number;
}

const LABELS: Record<string, string> = { like: "Like", love: "Love", heart: "Love", haha: "Haha", wow: "Wow", sad: "Sad", angry: "Angry", fire: "Fire", care: "Care" };

/**
 * How your post is doing: reactions by kind, comments, shares, and how many different people
 * engaged with it. (Who saved it stays private to them.)
 */
const PostInsightsDialog = ({ postId, open, onOpenChange }: { postId: string; open: boolean; onOpenChange: (open: boolean) => void }) => {
  const [data, setData] = useState<Insights | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setData(null);
    (async () => {
      const [{ data: reactions }, { data: comments }, { data: shares }] = await Promise.all([
        supabase.from("reactions").select("user_id, reaction_type").eq("post_id", postId),
        supabase.from("comments").select("user_id").eq("post_id", postId),
        supabase.from("shared_posts").select("user_id").eq("original_post_id", postId),
      ]);
      if (cancelled) return;
      const byType: Record<string, number> = {};
      for (const r of reactions ?? []) byType[r.reaction_type] = (byType[r.reaction_type] ?? 0) + 1;
      const people = new Set([...(reactions ?? []), ...(comments ?? []), ...(shares ?? [])].map((r) => r.user_id));
      setData({ reactions: byType, comments: comments?.length ?? 0, shares: shares?.length ?? 0, people: people.size });
    })();
    return () => { cancelled = true; };
  }, [open, postId]);

  const totalReactions = data ? Object.values(data.reactions).reduce((a, b) => a + b, 0) : 0;
  const stat = (icon: React.ReactNode, value: number, label: string) => (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-secondary/70 px-2 py-3">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-xl font-bold tabular-nums">{value.toLocaleString()}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Post insights</DialogTitle>
          <DialogDescription>Only you can see this.</DialogDescription>
        </DialogHeader>
        {!data ? (
          <div className="grid grid-cols-3 gap-2" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-secondary" />)}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {stat(<Users className="h-5 w-5" />, data.people, data.people === 1 ? "person engaged" : "people engaged")}
              {stat(<MessageCircle className="h-5 w-5" />, data.comments, data.comments === 1 ? "comment" : "comments")}
              {stat(<Share2 className="h-5 w-5" />, data.shares, data.shares === 1 ? "share" : "shares")}
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Reactions · {totalReactions.toLocaleString()}</p>
              {totalReactions === 0 ? (
                <p className="text-sm text-muted-foreground">No reactions yet.</p>
              ) : (
                <ul className="space-y-2">
                  {Object.entries(data.reactions).sort((a, b) => b[1] - a[1]).map(([type, n]) => (
                    <li key={type} className="flex items-center gap-3">
                      <ReactionEmoji type={type} className="h-6 w-6" />
                      <span className="w-14 text-sm">{LABELS[type] ?? type}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (100 * n) / totalReactions)}%` }} />
                      </span>
                      <span className="w-8 text-right text-sm tabular-nums text-muted-foreground">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PostInsightsDialog;
