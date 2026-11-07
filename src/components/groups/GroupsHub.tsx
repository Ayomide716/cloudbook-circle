import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import GroupInitials from "@/components/groups/GroupInitials";
import GroupPostCard, { type GroupPostView } from "@/components/groups/GroupPostCard";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { RowSkeleton } from "@/components/skeletons/parts";
import { groupVisits } from "@/lib/recent-groups";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/utils";

interface HubGroup { id: string; name: string; image_url: string | null }

/**
 * Facebook's Groups tab: your groups as round tiles (a badge for new posts since you last
 * looked, the ones you open most first), then a feed of the latest posts from all of them.
 */
const GroupsHub = ({ groups, userId, onDiscover }: { groups: HubGroup[]; userId: string; onDiscover: () => void }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [posts, setPosts] = useState<GroupPostView[] | null>(null);
  const ids = groups.map((g) => g.id).join(",");

  useEffect(() => {
    if (!ids) { setPosts([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("group_posts")
        .select("*")
        .in("group_id", ids.split(","))
        .order("created_at", { ascending: false })
        .limit(30);
      const list = data ?? [];
      const authors = [...new Set(list.map((p) => p.user_id))];
      const { data: profs } = authors.length ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", authors) : { data: [] };
      if (cancelled) return;
      const people = new Map((profs ?? []).map((p) => [p.id, p]));
      const byId = new Map(groups.map((g) => [g.id, g]));
      setPosts(list.map((p) => ({
        ...p,
        author: people.get(p.user_id) ?? { full_name: null, avatar_url: null },
        group: byId.has(p.group_id) ? { id: p.group_id, name: byId.get(p.group_id)!.name } : undefined,
      })));
    })();
    return () => { cancelled = true; };
    // groups only matters through ids (names are read when the posts arrive).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const deletePost = async (post: GroupPostView) => {
    const { error } = await supabase.from("group_posts").delete().eq("id", post.id);
    if (error) { toast({ title: "Couldn't delete post", description: friendlyError(error), variant: "destructive" }); return; }
    setPosts((list) => list?.filter((p) => p.id !== post.id) ?? null);
  };

  if (groups.length === 0) {
    return (
      <section className="feed-section border-y border-border/60 bg-card sm:rounded-2xl sm:border">
        <EmptyState
          emoji="people"
          title="Join a few groups"
          text="Posts from your groups show up here: your church, your estate, your old school."
          action={<Button onClick={onDiscover} className="rounded-full px-5">Discover groups</Button>}
        />
      </section>
    );
  }

  const visits = groupVisits();
  const newCount = (g: HubGroup) => (posts ?? []).filter((p) => p.group_id === g.id && p.user_id !== userId && Date.parse(p.created_at) > (visits[g.id] ?? 0)).length;
  const ordered = [...groups].sort((a, b) => newCount(b) - newCount(a) || (visits[b.id] ?? 0) - (visits[a.id] ?? 0));

  return (
    <div className="space-y-2 sm:space-y-3">
      <section aria-label="Your groups" className="feed-section border-y border-border/60 bg-card py-2 sm:rounded-2xl sm:border">
        <div className="flex gap-3.5 overflow-x-auto px-4 py-1.5 scrollbar-hide">
          {ordered.map((g) => {
            const n = newCount(g);
            return (
              <button key={g.id} type="button" onClick={() => navigate(`/groups/${g.id}`)} className="flex w-[72px] shrink-0 flex-col items-center gap-1.5 text-center">
                <span className="relative">
                  {g.image_url ? (
                    <img src={g.image_url} alt="" loading="lazy" className={`h-[64px] w-[64px] rounded-full object-cover ${n > 0 ? "ring-2 ring-brand ring-offset-2 ring-offset-card" : ""}`} />
                  ) : (
                    <GroupInitials id={g.id} name={g.name} className={`h-[64px] w-[64px] rounded-full text-lg ${n > 0 ? "ring-2 ring-brand ring-offset-2 ring-offset-card" : ""}`} />
                  )}
                  {n > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-badge px-1 text-[10px] font-bold text-white" aria-label={`${n} new posts`}>
                      {n > 9 ? "9+" : n}
                    </span>
                  )}
                </span>
                <span className={`line-clamp-2 text-xs leading-tight ${n > 0 ? "font-semibold" : "font-medium text-foreground/90"}`}>{g.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      {posts === null ? (
        <div className="feed-section bg-card sm:rounded-2xl">{[0, 1, 2].map((r) => <RowSkeleton key={r} />)}</div>
      ) : posts.length === 0 ? (
        <section className="feed-section border-y border-border/60 bg-card sm:rounded-2xl sm:border">
          <EmptyState emoji="chat" title="It's quiet in your groups" text="Be the first to post: open a group and share something." />
        </section>
      ) : (
        posts.map((p) => <GroupPostCard key={p.id} post={p} currentUserId={userId} onDelete={deletePost} />)
      )}
    </div>
  );
};

export default GroupsHub;
