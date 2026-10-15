import { useEffect, useMemo, useState } from "react";
import { Check, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export interface TaggedFriend {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface TagFriendsProps {
  userId: string;
  value: TaggedFriend[];
  onChange: (friends: TaggedFriend[]) => void;
}

/** "Tag friends" in the composer: a person icon that opens your friends list to pick from. */
const TagFriends = ({ userId, value, onChange }: TagFriendsProps) => {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<TaggedFriend[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open || friends) return;
    void (async () => {
      const { data: rows } = await supabase
        .from("friendships")
        .select("user_id, friend_id")
        .eq("status", "accepted")
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
      const ids = (rows ?? []).map((r) => (r.user_id === userId ? r.friend_id : r.user_id));
      const { data } = ids.length
        ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids).order("full_name")
        : { data: [] };
      setFriends(data ?? []);
    })();
  }, [open, friends, userId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (friends ?? []).filter((f) => !q || f.full_name?.toLowerCase().includes(q));
  }, [friends, query]);

  const toggle = (f: TaggedFriend) =>
    onChange(value.some((v) => v.id === f.id) ? value.filter((v) => v.id !== f.id) : [...value, f]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-9 w-9 rounded-full text-sky-600 hover:bg-sky-500/10", value.length > 0 && "bg-sky-500/10")}
        onClick={() => setOpen(true)}
        aria-label="Tag friends"
      >
        <UserPlus className="h-5 w-5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tag friends</DialogTitle>
          </DialogHeader>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your friends" aria-label="Search your friends" className="rounded-full" />
          <ul className="-mx-2 max-h-[50vh] overflow-y-auto">
            {friends === null ? (
              <li className="py-8 text-center text-sm text-muted-foreground">Loading…</li>
            ) : shown.length === 0 ? (
              <li className="py-8 text-center text-sm text-muted-foreground">{friends.length ? "No friends match that." : "Add friends to tag them in posts."}</li>
            ) : (
              shown.map((f) => {
                const on = value.some((v) => v.id === f.id);
                return (
                  <li key={f.id}>
                    <button type="button" onClick={() => toggle(f)} aria-pressed={on} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-accent/60">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={f.avatar_url || undefined} alt="" />
                        <AvatarFallback>{f.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1 truncate font-medium">{f.full_name || "Friend"}</span>
                      <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                        {on && <Check className="h-4 w-4" />}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <Button onClick={() => setOpen(false)} className="w-full rounded-full">Done</Button>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TagFriends;
