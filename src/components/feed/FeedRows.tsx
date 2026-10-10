import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Check, History, Loader2, Play, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

/** Rows that break up the feed, as Facebook's do: Reels, groups to join, and memories. */

const RowShell = ({ title, link, linkLabel = "See all", children, label }: { title: string; link: string; linkLabel?: string; children: React.ReactNode; label: string }) => (
  <section className="feed-section overflow-hidden rounded-[1.125rem] border bg-card py-3" aria-label={label}>
    <div className="flex items-center justify-between px-3.5 pb-2.5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <Link to={link} className="text-sm font-medium text-primary hover:underline">{linkLabel}</Link>
    </div>
    <div className="flex snap-x gap-2.5 overflow-x-auto px-3.5 pb-1 scrollbar-hide">{children}</div>
  </section>
);

interface ReelThumb {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  views_count: number | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}

/** "Reels": the newest reels as tall thumbnails; tapping one opens it in Reels. */
export const ReelsRow = () => {
  const navigate = useNavigate();
  const [reels, setReels] = useState<ReelThumb[]>([]);
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("reels")
      .select("id, video_url, thumbnail_url, caption, views_count, profiles (full_name, avatar_url)")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => { if (!cancelled) setReels((data as unknown as ReelThumb[]) ?? []); });
    return () => { cancelled = true; };
  }, []);
  if (reels.length === 0) return null;
  return (
    <RowShell title="Reels" link="/reels" label="Reels">
      {reels.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => navigate(`/reels/${r.id}`)}
          className="relative h-[200px] w-[118px] flex-shrink-0 snap-start overflow-hidden rounded-xl bg-black text-left"
          aria-label={`Reel by ${r.profiles?.full_name || "someone"}`}
        >
          {r.thumbnail_url ? (
            <img src={r.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            // No thumbnail saved: the video's first frame.
            <video src={`${r.video_url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          )}
          <span className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/75" />
          <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white">
            <Play className="h-3.5 w-3.5 fill-white" />
          </span>
          <span className="absolute inset-x-2 bottom-2 line-clamp-2 text-[11.5px] font-semibold leading-tight text-white drop-shadow">
            {r.caption || r.profiles?.full_name || "Reel"}
          </span>
        </button>
      ))}
    </RowShell>
  );
};

interface GroupSuggestion {
  id: string;
  name: string;
  image_url: string | null;
  members: number | null;
}

/** "Groups you might like": community groups you're not in, with Join. */
export const GroupsRow = ({ currentUserId }: { currentUserId: string }) => {
  const { toast } = useToast();
  const [groups, setGroups] = useState<GroupSuggestion[]>([]);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: all }, { data: mine }] = await Promise.all([
        supabase.from("groups").select("*").order("created_at", { ascending: false }).limit(40),
        supabase.from("group_members").select("group_id").eq("user_id", currentUserId),
      ]);
      const mineIds = new Set((mine ?? []).map((m) => m.group_id));
      const options = (all ?? []).filter((g) => !mineIds.has(g.id) && (g as { is_chat?: boolean }).is_chat !== true).slice(0, 10);
      if (!options.length) { if (!cancelled) setGroups([]); return; }
      const { data: counts } = await supabase.rpc("group_member_counts", { _group_ids: options.map((g) => g.id) });
      if (cancelled) return;
      setGroups(options.map((g) => ({
        id: g.id,
        name: g.name,
        image_url: g.image_url,
        members: counts ? Number(counts.find((c) => c.group_id === g.id)?.member_count ?? 0) : null,
      })));
    })();
    return () => { cancelled = true; };
  }, [currentUserId]);

  const join = async (g: GroupSuggestion) => {
    setBusy(g.id);
    const { error } = await supabase.from("group_members").insert({ group_id: g.id, user_id: currentUserId, role: "member" });
    setBusy(null);
    if (error) return toast({ title: "Couldn't join", description: error.message, variant: "destructive" });
    setJoined((s) => new Set(s).add(g.id));
  };

  if (groups.length === 0) return null;
  return (
    <RowShell title="Groups you might like" link="/groups" label="Groups you might like">
      {groups.map((g) => (
        <div key={g.id} className="w-[150px] flex-shrink-0 snap-start overflow-hidden rounded-xl border bg-secondary/40">
          <Link to={`/groups/${g.id}`} className="block">
            {g.image_url ? (
              <img src={g.image_url} alt="" loading="lazy" className="h-[90px] w-full object-cover" />
            ) : (
              <div className="flex h-[90px] items-center justify-center bg-primary/15"><Users className="h-8 w-8 text-primary" /></div>
            )}
          </Link>
          <div className="p-2.5">
            <Link to={`/groups/${g.id}`} className="line-clamp-2 min-h-[2.5em] text-[13.5px] font-semibold leading-tight hover:underline">{g.name}</Link>
            {g.members !== null && <p className="mt-0.5 text-xs text-muted-foreground">{g.members} {g.members === 1 ? "member" : "members"}</p>}
            {joined.has(g.id) ? (
              <Button size="sm" variant="secondary" disabled className="mt-2 h-8 w-full rounded-lg"><Check className="mr-1 h-4 w-4" /> Joined</Button>
            ) : (
              <Button size="sm" className="mt-2 h-8 w-full rounded-lg" disabled={busy === g.id} onClick={() => join(g)} aria-label={`Join ${g.name}`}>
                {busy === g.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join group"}
              </Button>
            )}
          </div>
        </div>
      ))}
    </RowShell>
  );
};

interface Memory {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
}

/** "On this day": something you posted on today's date in an earlier year. */
export const OnThisDay = ({ currentUserId, name, avatarUrl }: { currentUserId: string; name: string | null; avatarUrl: string | null }) => {
  const [memory, setMemory] = useState<Memory | null>(null);
  useEffect(() => {
    let cancelled = false;
    const dismissedKey = `cloudbook_memory_seen_${format(new Date(), "yyyy-MM-dd")}`;
    try { if (localStorage.getItem(dismissedKey)) return; } catch { /* fine */ }
    (async () => {
      const yearAgo = new Date();
      yearAgo.setDate(yearAgo.getDate() - 300);
      const { data } = await supabase
        .from("posts")
        .select("id, content, image_url, created_at")
        .eq("user_id", currentUserId)
        .lt("created_at", yearAgo.toISOString())
        .order("created_at", { ascending: false })
        .limit(400);
      const today = format(new Date(), "MM-dd");
      const match = (data ?? []).find((p) => p.created_at && format(new Date(p.created_at), "MM-dd") === today);
      if (!cancelled) setMemory(match ? { ...match, created_at: match.created_at! } : null);
    })();
    return () => { cancelled = true; };
  }, [currentUserId]);

  if (!memory) return null;
  const years = new Date().getFullYear() - new Date(memory.created_at).getFullYear();
  const dismiss = () => {
    try { localStorage.setItem(`cloudbook_memory_seen_${format(new Date(), "yyyy-MM-dd")}`, "1"); } catch { /* fine */ }
    setMemory(null);
  };
  return (
    <section className="feed-section overflow-hidden rounded-[1.125rem] border bg-card" aria-label="On this day">
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <History className="h-5 w-5 text-primary" />
        <h2 className="flex-1 text-[15px] font-semibold">On this day</h2>
        <button type="button" onClick={dismiss} className="text-sm text-muted-foreground hover:text-foreground">Not now</button>
      </div>
      <Link to={`/post/${memory.id}`} className="block px-3.5 pb-3.5 pt-2">
        <p className="text-sm text-muted-foreground">{years} {years === 1 ? "year" : "years"} ago today, you shared:</p>
        <div className="mt-2 flex gap-3 rounded-xl border bg-secondary/40 p-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={avatarUrl || undefined} />
            <AvatarFallback>{name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{format(new Date(memory.created_at), "d MMMM yyyy")}</p>
            <p className="line-clamp-3 text-[14px]">{memory.content}</p>
          </div>
          {memory.image_url && <img src={memory.image_url} alt="" className="h-16 w-16 flex-shrink-0 rounded-lg object-cover" />}
        </div>
      </Link>
    </section>
  );
};
