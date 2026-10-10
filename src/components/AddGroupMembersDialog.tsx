import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Friend {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface AddGroupMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  groupName: string;
  currentUserId: string;
  /** People already in the group (they're marked instead of offered). */
  memberIds: string[];
  onAdded: () => void;
}

/** "Add people": your friends, with a search box and an Add button each, as on Facebook. */
const AddGroupMembersDialog = ({ open, onOpenChange, groupId, groupName, currentUserId, memberIds, onAdded }: AddGroupMembersDialogProps) => {
  const { toast } = useToast();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: links } = await supabase
        .from("friendships")
        .select("user_id, friend_id")
        .eq("status", "accepted")
        .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);
      const ids = (links ?? []).map((f) => (f.user_id === currentUserId ? f.friend_id : f.user_id));
      if (ids.length === 0) { if (!cancelled) setFriends([]); return; }
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
      if (!cancelled) setFriends((profiles ?? []).sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")));
    })();
    return () => { cancelled = true; };
  }, [open, currentUserId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (friends ?? []).filter((f) => !q || (f.full_name ?? "").toLowerCase().includes(q));
  }, [friends, query]);

  const add = async (friend: Friend) => {
    setAdding(friend.id);
    const { error } = await supabase.rpc("add_group_member", { _group: groupId, _user: friend.id });
    setAdding(null);
    if (error) {
      const missing = /function .*add_group_member|Could not find the function/i.test(error.message);
      toast({
        title: `Couldn't add ${friend.full_name || "them"}`,
        description: missing ? "Adding people needs the latest database update." : error.message,
        variant: "destructive",
      });
      return;
    }
    setAdded((s) => new Set(s).add(friend.id));
    onAdded();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) { setQuery(""); setAdded(new Set()); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add people to {groupName}</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your friends" aria-label="Search your friends" className="rounded-full pl-9" />
        </div>
        <div className="-mx-2 max-h-[55dvh] overflow-y-auto">
          {friends === null ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {friends.length === 0 ? "Add some friends first, then you can bring them into groups." : "No friends match that name."}
            </p>
          ) : (
            shown.map((f) => {
              const inGroup = memberIds.includes(f.id) || added.has(f.id);
              return (
                <div key={f.id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={f.avatar_url || undefined} alt="" />
                    <AvatarFallback>{f.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                  <p className="min-w-0 flex-1 truncate font-medium">{f.full_name || "Anonymous"}</p>
                  {inGroup ? (
                    <span className="flex items-center gap-1 text-sm text-muted-foreground"><Check className="h-4 w-4" /> {added.has(f.id) ? "Added" : "Member"}</span>
                  ) : (
                    <Button size="sm" className="h-8 rounded-full" disabled={adding === f.id} onClick={() => add(f)} aria-label={`Add ${f.full_name || "friend"}`}>
                      {adding === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="mr-1 h-4 w-4" /> Add</>}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddGroupMembersDialog;
