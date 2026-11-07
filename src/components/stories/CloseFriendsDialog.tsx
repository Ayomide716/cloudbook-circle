import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Check, Loader2, Search } from "@/components/icons";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn, friendlyError } from "@/lib/utils";

interface Friend { id: string; full_name: string | null; avatar_url: string | null }

/**
 * Your close friends list, as on Instagram: stories you share to "Close friends" only reach
 * them, with a green ring. Nobody can see who's on it.
 */
const CloseFriendsDialog = ({ open, onOpenChange, currentUserId }: { open: boolean; onOpenChange: (open: boolean) => void; currentUserId: string }) => {
  const { toast } = useToast();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [{ data: links }, { data: list }] = await Promise.all([
        supabase.from("friendships").select("user_id, friend_id").or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`).eq("status", "accepted"),
        supabase.from("close_friends").select("friend_id").eq("user_id", currentUserId),
      ]);
      const ids = (links ?? []).map((f) => (f.user_id === currentUserId ? f.friend_id : f.user_id));
      const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids) : { data: [] as Friend[] };
      if (cancelled) return;
      setChosen(new Set((list ?? []).map((r) => r.friend_id)));
      setFriends((people ?? []).sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")));
    })();
    return () => { cancelled = true; };
  }, [open, currentUserId]);

  const toggle = async (f: Friend) => {
    const on = chosen.has(f.id);
    setBusy(f.id);
    const { error } = on
      ? await supabase.from("close_friends").delete().eq("user_id", currentUserId).eq("friend_id", f.id)
      : await supabase.from("close_friends").insert({ user_id: currentUserId, friend_id: f.id });
    setBusy(null);
    if (error) { toast({ title: "Couldn't update your list", description: friendlyError(error), variant: "destructive" }); return; }
    setChosen((s) => { const n = new Set(s); if (on) n.delete(f.id); else n.add(f.id); return n; });
  };

  const q = query.trim().toLowerCase();
  const shown = (friends ?? []).filter((f) => !q || (f.full_name ?? "").toLowerCase().includes(q));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Close friends</DialogTitle>
          <DialogDescription>Only these friends see stories you share to Close friends. Nobody can see this list.</DialogDescription>
        </DialogHeader>
        <label className="flex h-10 items-center gap-2 rounded-full bg-secondary px-3.5 text-muted-foreground">
          <Search className="h-[18px] w-[18px]" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search friends" aria-label="Search friends" className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground" />
        </label>
        <p className="text-[13px] font-semibold text-muted-foreground">{chosen.size} {chosen.size === 1 ? "person" : "people"}</p>
        <div className="-mx-2 min-h-0 flex-1 overflow-y-auto">
          {friends === null ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : shown.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{friends.length ? "No friends match." : "Add friends first, then pick your close friends here."}</p>
          ) : shown.map((f) => {
            const on = chosen.has(f.id);
            return (
              <button key={f.id} type="button" onClick={() => void toggle(f)} disabled={busy === f.id} aria-pressed={on} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-accent/60">
                <Avatar className="h-11 w-11">
                  <AvatarImage src={f.avatar_url || undefined} alt="" className="object-cover" />
                  <AvatarFallback>{f.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{f.full_name || "Friend"}</span>
                <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2", on ? "border-green-500 bg-green-500 text-white" : "border-border")}>
                  {busy === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CloseFriendsDialog;
