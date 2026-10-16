import { useEffect, useMemo, useState } from "react";
import { Check, Forward, Loader2, Search, Users } from "@/components/icons";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { forwardMessage, type ForwardableMessage } from "@/lib/forward";

interface Target {
  kind: "dm" | "group";
  id: string;
  name: string;
  avatar: string | null;
}

const MAX = 5;

interface ForwardDialogProps {
  message: ForwardableMessage | null;
  currentUserId: string;
  onOpenChange: (open: boolean) => void;
}

/**
 * WhatsApp's "Forward to…": your recent chats, friends and group chats, with search. Pick up to
 * five and send.
 */
const ForwardDialog = ({ message, currentUserId, onOpenChange }: ForwardDialogProps) => {
  const { toast } = useToast();
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Target[]>([]);
  const [sending, setSending] = useState(false);
  const open = !!message;

  useEffect(() => {
    if (!open) return;
    setPicked([]);
    setQuery("");
    let cancelled = false;
    (async () => {
      const [{ data: recent }, { data: friends }, { data: memberships }] = await Promise.all([
        supabase.from("messages").select("sender_id, receiver_id").or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`).order("created_at", { ascending: false }).limit(300),
        supabase.from("friendships").select("user_id, friend_id").eq("status", "accepted").or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`),
        supabase.from("group_members").select("group_id").eq("user_id", currentUserId),
      ]);
      // People you've talked to most recently first, then the rest of your friends.
      const ids: string[] = [];
      for (const m of recent ?? []) {
        const other = m.sender_id === currentUserId ? m.receiver_id : m.sender_id;
        if (other !== currentUserId && !ids.includes(other)) ids.push(other);
      }
      for (const f of friends ?? []) {
        const other = f.user_id === currentUserId ? f.friend_id : f.user_id;
        if (!ids.includes(other)) ids.push(other);
      }
      const groupIds = (memberships ?? []).map((m) => m.group_id);
      const [{ data: profiles }, { data: groups }] = await Promise.all([
        ids.length ? supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids) : Promise.resolve({ data: [] as { id: string; full_name: string | null; avatar_url: string | null }[] }),
        groupIds.length ? supabase.from("groups").select("*").in("id", groupIds) : Promise.resolve({ data: [] as { id: string; name: string; image_url: string | null; is_chat?: boolean }[] }),
      ]);
      if (cancelled) return;
      const people: Target[] = ids
        .map((id) => (profiles ?? []).find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map((p) => ({ kind: "dm", id: p.id, name: p.full_name || "Anonymous", avatar: p.avatar_url }));
      const chats: Target[] = (groups ?? [])
        .filter((g) => (g as { is_chat?: boolean }).is_chat === true)
        .map((g) => ({ kind: "group", id: g.id, name: g.name, avatar: g.image_url }));
      setTargets([...chats, ...people]);
    })();
    return () => { cancelled = true; };
  }, [open, currentUserId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (targets ?? []).filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [targets, query]);

  const toggle = (t: Target) => {
    setPicked((prev) => {
      if (prev.some((p) => p.id === t.id)) return prev.filter((p) => p.id !== t.id);
      if (prev.length >= MAX) {
        toast({ title: `You can forward to up to ${MAX} chats at a time` });
        return prev;
      }
      haptic(8);
      return [...prev, t];
    });
  };

  const send = async () => {
    if (!message || picked.length === 0) return;
    setSending(true);
    const failed = await forwardMessage(message, picked, currentUserId);
    setSending(false);
    if (failed === picked.length) {
      toast({ title: "Couldn't forward the message", variant: "destructive" });
      return;
    }
    haptic();
    toast({
      title: picked.length === 1 ? `Forwarded to ${picked[0].name}` : `Forwarded to ${picked.length - failed} chats`,
      description: failed ? `${failed} couldn't be sent.` : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-4 pb-3 pt-4">
          <DialogTitle>Forward to…</DialogTitle>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search chats" className="rounded-full pl-9" />
          </div>
        </DialogHeader>
        <div className="min-h-[240px] flex-1 overflow-y-auto px-2 py-2">
          {targets === null ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No chats found</p>
          ) : (
            shown.map((t) => {
              const on = picked.some((p) => p.id === t.id);
              return (
                <button
                  key={`${t.kind}-${t.id}`}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(t)}
                  className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors", on ? "bg-primary/10" : "hover:bg-secondary")}
                >
                  <span className="relative">
                    <Avatar className="h-11 w-11">
                      <AvatarImage src={t.avatar || undefined} className="object-cover" />
                      <AvatarFallback className={cn(t.kind === "group" && "bg-secondary")}>
                        {t.kind === "group" ? <Users className="h-5 w-5 text-muted-foreground" /> : t.name[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {on && (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.name}</span>
                    {t.kind === "group" && <span className="block text-xs text-muted-foreground">Group</span>}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-3 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {picked.length ? picked.map((p) => p.name.split(" ")[0]).join(", ") : "Choose up to 5 chats"}
          </p>
          <Button onClick={send} disabled={sending || picked.length === 0} className="h-11 rounded-full px-5" aria-label="Send forwarded message">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Forward className="mr-1.5 h-4 w-4" /> Send</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ForwardDialog;
