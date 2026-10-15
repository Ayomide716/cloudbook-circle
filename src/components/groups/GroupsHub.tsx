import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import GroupInitials from "@/components/groups/GroupInitials";
import { groupVisits } from "@/lib/recent-groups";

interface HubGroup { id: string; name: string; image_url: string | null }
interface HubPost { id: string; group_id: string; user_id: string; content: string; image_url: string | null; created_at: string }

/**
 * The top of Groups, as on Facebook: your groups as tiles (new posts since you last looked as a
 * badge, the ones you open most first), then the latest posts across all of them.
 */
const GroupsHub = ({ groups, userId }: { groups: HubGroup[]; userId: string }) => {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<HubPost[]>([]);
  const [people, setPeople] = useState<Record<string, { full_name: string | null; avatar_url: string | null }>>({});
  const ids = groups.map((g) => g.id).join(",");

  useEffect(() => {
    if (!ids) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("group_posts")
        .select("id, group_id, user_id, content, image_url, created_at")
        .in("group_id", ids.split(","))
        .order("created_at", { ascending: false })
        .limit(40);
      const list = data ?? [];
      const authors = [...new Set(list.map((p) => p.user_id))];
      const { data: profs } = authors.length ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", authors) : { data: [] };
      if (cancelled) return;
      setPosts(list);
      setPeople(Object.fromEntries((profs ?? []).map((p) => [p.id, p])));
    })();
    return () => { cancelled = true; };
  }, [ids]);

  if (groups.length === 0) return null;
  const visits = groupVisits();
  const newCount = (g: HubGroup) => posts.filter((p) => p.group_id === g.id && p.user_id !== userId && Date.parse(p.created_at) > (visits[g.id] ?? 0)).length;
  const ordered = [...groups].sort((a, b) => newCount(b) - newCount(a) || (visits[b.id] ?? 0) - (visits[a.id] ?? 0));
  const byId = new Map(groups.map((g) => [g.id, g]));
  const latest = posts.filter((p) => p.user_id !== userId).slice(0, 5);

  return (
    <div className="mb-3 space-y-2 sm:mb-4 sm:space-y-3">
      <section aria-label="Your groups" className="feed-section border border-border/60 bg-card py-3 sm:rounded-2xl">
        <h2 className="px-4 text-[15px] font-semibold">Your groups</h2>
        <div className="mt-2 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide">
          {ordered.map((g) => {
            const n = newCount(g);
            return (
              <button key={g.id} type="button" onClick={() => navigate(`/groups/${g.id}`)} className="flex w-[76px] shrink-0 flex-col items-center gap-1.5 text-center">
                <span className="relative">
                  {g.image_url ? (
                    <img src={g.image_url} alt="" loading="lazy" className="h-[68px] w-[68px] rounded-2xl object-cover" />
                  ) : (
                    <GroupInitials id={g.id} name={g.name} className="h-[68px] w-[68px] rounded-2xl text-lg" />
                  )}
                  {n > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card bg-primary px-1 text-[10px] font-bold text-primary-foreground" aria-label={`${n} new posts`}>
                      {n > 9 ? "9+" : n}
                    </span>
                  )}
                </span>
                <span className={`line-clamp-2 text-[12px] leading-tight ${n > 0 ? "font-semibold" : "font-medium"}`}>{g.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      {latest.length > 0 && (
        <section aria-label="Latest from your groups" className="feed-section border border-border/60 bg-card sm:rounded-2xl">
          <h2 className="px-4 pt-3 text-[15px] font-semibold">Latest from your groups</h2>
          <div className="divide-y divide-border">
            {latest.map((p) => {
              const g = byId.get(p.group_id);
              const who = people[p.user_id];
              return (
                <button key={p.id} type="button" onClick={() => navigate(`/groups/${p.group_id}`)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={who?.avatar_url || undefined} alt="" />
                    <AvatarFallback>{who?.full_name?.[0] ?? "?"}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{who?.full_name || "Someone"}</span> in {g?.name}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[15px]">{p.content || (p.image_url ? "Shared a photo" : "")}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{formatDistanceToNowStrict(new Date(p.created_at), { addSuffix: true })}</span>
                  </span>
                  {p.image_url && <img src={p.image_url} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg object-cover" />}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

export default GroupsHub;
