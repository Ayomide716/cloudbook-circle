import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Loader2, UserPlus, X } from "@/components/icons";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface Suggestion {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  mutual: number;
}

const DISMISSED_KEY = "cloudbook_dismissed_suggestions";
const readDismissed = (): string[] => {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]") as string[]; } catch { return []; }
};

/**
 * "People you may know" between posts, as on Facebook: swipe through friends of friends (or,
 * when you're new, other people on Ember) and add them (or ✕ to stop suggesting someone).
 * Hidden when there's no one to suggest.
 */
const PeopleYouMayKnow = ({ currentUserId }: { currentUserId: string }) => {
  const { toast } = useToast();
  const [people, setPeople] = useState<Suggestion[] | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const dismissed = new Set(readDismissed());
      const { data: ranked } = await supabase.rpc("friend_suggestions", { _limit: 15 });
      const fromFriends = (ranked ?? []).filter((r) => !dismissed.has(r.user_id));
      let list: Suggestion[] = [];
      if (fromFriends.length) {
        const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", fromFriends.map((r) => r.user_id));
        list = fromFriends.map((r) => {
          const p = profiles?.find((x) => x.id === r.user_id);
          return { id: r.user_id, full_name: p?.full_name ?? null, avatar_url: p?.avatar_url ?? null, mutual: Number(r.mutual_count) };
        });
      }
      // New here (no friends, so no friends of friends): suggest other people on Ember,
      // newest first, leaving out anyone you're already connected with or have blocked.
      if (list.length < 6) {
        const [{ data: links }, { data: blocks }, { data: recent }] = await Promise.all([
          supabase.from("friendships").select("user_id, friend_id").or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`),
          supabase.from("blocks").select("blocker_id, blocked_id").or(`blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}`),
          supabase.from("profiles").select("id, full_name, avatar_url").neq("id", currentUserId).not("full_name", "is", null).order("created_at", { ascending: false }).limit(40),
        ]);
        const skip = new Set([
          currentUserId,
          ...list.map((p) => p.id),
          ...dismissed,
          ...(links ?? []).flatMap((f) => [f.user_id, f.friend_id]),
          ...(blocks ?? []).flatMap((b) => [b.blocker_id, b.blocked_id]),
        ]);
        list = [
          ...list,
          ...(recent ?? []).filter((p) => !skip.has(p.id)).slice(0, 15 - list.length).map((p) => ({ ...p, mutual: 0 })),
        ];
      }
      if (!cancelled) setPeople(list);
    })();
    return () => { cancelled = true; };
  }, [currentUserId]);

  const add = async (person: Suggestion) => {
    setBusy(person.id);
    const { error } = await supabase.from("friendships").insert({ user_id: currentUserId, friend_id: person.id, status: "pending" });
    setBusy(null);
    if (error) {
      toast({ title: "Couldn't send the request", description: error.message, variant: "destructive" });
      return;
    }
    setSent((s) => new Set(s).add(person.id));
  };

  const dismiss = (id: string) => {
    try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...readDismissed(), id].slice(-200))); } catch { /* fine */ }
    setPeople((list) => list?.filter((p) => p.id !== id) ?? null);
  };

  if (!people?.length) return null;

  return (
    <section className="feed-section overflow-hidden rounded-[1.125rem] border bg-card py-3" aria-label="People you may know">
      <div className="flex items-center justify-between px-3.5 pb-2.5">
        <h2 className="text-[15px] font-semibold">People you may know</h2>
        <Link to="/friends" className="text-sm font-medium text-primary hover:underline">See all</Link>
      </div>
      <div className="flex snap-x gap-2.5 overflow-x-auto px-3.5 pb-1 scrollbar-hide">
        {people.map((p) => (
          <div key={p.id} className="relative w-[150px] flex-shrink-0 snap-start overflow-hidden rounded-xl border bg-secondary/40">
            <button
              type="button"
              onClick={() => dismiss(p.id)}
              aria-label={`Don't suggest ${p.full_name || "this person"}`}
              className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white"
            >
              <X className="h-4 w-4" />
            </button>
            <Link to={`/profile/${p.id}`} className="block">
              <Avatar className="h-[130px] w-full rounded-none">
                <AvatarImage src={p.avatar_url || undefined} className="object-cover" />
                <AvatarFallback className="rounded-none text-3xl">{p.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
              </Avatar>
            </Link>
            <div className="p-2.5">
              <Link to={`/profile/${p.id}`} className="block truncate text-[14px] font-semibold hover:underline">{p.full_name || "Someone"}</Link>
              <p className="truncate text-xs text-muted-foreground">{p.mutual > 0 ? `${p.mutual} mutual ${p.mutual === 1 ? "friend" : "friends"}` : "On Ember"}</p>
              {sent.has(p.id) ? (
                <Button size="sm" variant="secondary" disabled className="mt-2 h-8 w-full rounded-lg">
                  <Check className="mr-1 h-4 w-4" /> Requested
                </Button>
              ) : (
                <Button size="sm" variant="accent" className="mt-2 h-8 w-full rounded-lg" disabled={busy === p.id} onClick={() => add(p)} aria-label={`Add ${p.full_name || "friend"}`}>
                  {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="mr-1 h-4 w-4" /> Add friend</>}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default PeopleYouMayKnow;
