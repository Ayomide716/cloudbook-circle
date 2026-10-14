import { uploadMedia } from "@/lib/media-upload";
import { IMAGE_SIZES, shrinkImage } from "@/lib/image-compress";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSingleFlight } from "@/hooks/use-single-flight";
import { Camera, Check, Loader2, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Friend {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface NewGroupChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId: string;
  onCreated: (groupId: string) => void;
}

/**
 * "New group chat", as on WhatsApp: a name, an optional photo and the friends to invite. The
 * chat opens straight away; friends join once they accept the invite.
 */
const NewGroupChatDialog = ({ open, onOpenChange, currentUserId, onCreated }: NewGroupChatDialogProps) => {
  const { toast } = useToast();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoPreview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

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
      const { data } = ids.length ? await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids) : { data: [] };
      if (!cancelled) setFriends((data ?? []).sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")));
    })();
    return () => { cancelled = true; };
  }, [open, currentUserId]);

  const reset = () => { setPicked(new Set()); setQuery(""); setName(""); setPhoto(null); };

  const shown = (friends ?? []).filter((f) => !query.trim() || (f.full_name ?? "").toLowerCase().includes(query.trim().toLowerCase()));

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Extra taps while this is saving do nothing (no double posts on a slow network).
  const onceCreate = useSingleFlight();
  const create = onceCreate(async () => {
    const title = name.trim();
    if (!title || picked.size === 0) return;
    setCreating(true);
    const { data: group, error } = await supabase
      .from("groups")
      .insert({ name: title, created_by: currentUserId, is_chat: true })
      .select("id")
      .single();
    if (error || !group) {
      setCreating(false);
      toast({
        title: "Couldn't create the group chat",
        description: error && /is_chat/.test(error.message) ? "Group chats need the latest database update." : error?.message,
        variant: "destructive",
      });
      return;
    }
    await supabase.from("group_members").insert({ group_id: group.id, user_id: currentUserId, role: "admin" });
    if (photo) {
      // Same place community group photos go.
      const small = await shrinkImage(photo, IMAGE_SIZES.avatar);
      const path = `group-logos/${group.id}-${Date.now()}.${small.name.split(".").pop() || "jpg"}`;
      const imageUrl = await uploadMedia("avatars", path, small).catch(() => null);
      if (imageUrl) await supabase.from("groups").update({ image_url: imageUrl }).eq("id", group.id);
    }
    // Everyone picked gets an invite; they're in once they accept.
    const results = await Promise.all([...picked].map((id) => supabase.rpc("add_group_member", { _group: group.id, _user: id })));
    const failed = results.filter((r) => r.error).length;
    setCreating(false);
    toast({
      title: `${title} created`,
      description: failed ? `${picked.size - failed} invited; ${failed} couldn't be invited.` : `Invites sent to ${picked.size} ${picked.size === 1 ? "friend" : "friends"}.`,
    });
    reset();
    onOpenChange(false);
    onCreated(group.id);
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New group chat</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => photoInput.current?.click()}
            aria-label="Add a group photo"
            className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-muted-foreground"
          >
            {photoPreview ? <img src={photoPreview} alt="" className="h-full w-full object-cover" /> : <Camera className="h-6 w-6" />}
          </button>
          <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Group name" aria-label="Group name" className="h-11" />
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your friends" aria-label="Search your friends" className="rounded-full pl-9" />
        </div>

        <div className="-mx-2 max-h-[45dvh] overflow-y-auto">
          {friends === null ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{friends.length === 0 ? "Add some friends first." : "No friends match that name."}</p>
          ) : (
            shown.map((f) => {
              const on = picked.has(f.id);
              return (
                <button key={f.id} type="button" onClick={() => toggle(f.id)} aria-pressed={on} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-secondary">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={f.avatar_url || undefined} alt="" />
                    <AvatarFallback>{f.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate font-medium">{f.full_name || "Anonymous"}</span>
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2", on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}>
                    {on && <Check className="h-4 w-4" />}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <Button className="w-full rounded-full" disabled={creating || !name.trim() || picked.size === 0} onClick={create}>
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
          Create{picked.size > 0 ? ` and invite ${picked.size}` : ""}
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default NewGroupChatDialog;
