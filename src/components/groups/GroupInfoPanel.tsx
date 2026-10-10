import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, ExternalLink, LogOut, MoreVertical, Phone, Search, ShieldCheck, ShieldOff, UserMinus, UserPlus, Users, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionMenu, ActionMenuContent, ActionMenuItem, ActionMenuTrigger } from "@/components/ui/action-menu";
import ConfirmDialog from "@/components/ConfirmDialog";
import AddGroupMembersDialog from "@/components/AddGroupMembersDialog";
import type { GroupInfo } from "@/lib/group-chats";

export interface GroupMember {
  id: string;
  role: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface GroupInfoPanelProps {
  group: GroupInfo;
  members: GroupMember[];
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
  onCall: (voiceOnly: boolean) => void;
  onLeft: () => void;
}

const managementError = (error: { message: string }) =>
  /Could not find the function|function .*group_/i.test(error.message) ? "This needs the latest database update." : error.message;

/** The group's info, as on WhatsApp: picture, name, members (admins marked) and the actions. */
const GroupInfoPanel = ({ group, members, currentUserId, onClose, onChanged, onCall, onLeft }: GroupInfoPanelProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "remove"; member: GroupMember } | { kind: "leave" } | null>(null);

  const me = members.find((m) => m.id === currentUserId);
  const isAdmin = me?.role === "admin";
  const isCreator = group.created_by === currentUserId;
  const creator = members.find((m) => m.id === group.created_by);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => !q || (m.full_name ?? "").toLowerCase().includes(q));
  }, [members, query]);

  const removeMember = async (member: GroupMember) => {
    const { error } = await supabase.rpc("remove_group_member", { _group: group.id, _user: member.id });
    if (error) return toast({ title: "Couldn't remove them", description: managementError(error), variant: "destructive" });
    toast({ title: `${member.full_name || "They"} removed` });
    onChanged();
  };

  const changeRole = async (member: GroupMember, role: "admin" | "member") => {
    const { error } = await supabase.rpc("set_group_member_role", { _group: group.id, _user: member.id, _role: role });
    if (error) return toast({ title: "Couldn't change their role", description: managementError(error), variant: "destructive" });
    onChanged();
  };

  const leave = async () => {
    const { error } = await supabase.from("group_members").delete().eq("group_id", group.id).eq("user_id", currentUserId);
    if (error) return toast({ title: "Couldn't leave the group", description: error.message, variant: "destructive" });
    toast({ title: `You left ${group.name}` });
    onLeft();
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col overflow-y-auto bg-background animate-in slide-in-from-right-10 fade-in-0 duration-200">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-background/90 px-1.5 pb-1 pt-[max(0.375rem,env(safe-area-inset-top))] backdrop-blur">
        <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-6" aria-label="Back to the chat" onClick={onClose}>
          <ArrowLeft />
        </Button>
        {/* Community groups also have a page (posts, events); group chats are just the chat. */}
        {!group.is_chat && (
          <Button variant="ghost" size="icon" className="h-10 w-10 [&_svg]:size-5" aria-label="Open the group's page" title="Open the group's page" onClick={() => navigate(`/groups/${group.id}`)}>
            <ExternalLink />
          </Button>
        )}
      </div>

      {/* Picture, name, member count, quick actions */}
      <div className="flex flex-col items-center px-6 pb-5 text-center">
        <Avatar className="h-32 w-32">
          <AvatarImage src={group.image_url || undefined} className="object-cover" />
          <AvatarFallback className="bg-secondary"><Users className="h-12 w-12 text-muted-foreground" /></AvatarFallback>
        </Avatar>
        <h2 className="mt-4 font-display text-2xl font-bold leading-tight">{group.name}</h2>
        <p className="mt-1 text-muted-foreground">Group · {members.length} {members.length === 1 ? "member" : "members"}</p>
        <div className="mt-5 flex gap-3">
          {[
            { icon: Phone, label: "Voice", action: () => onCall(true) },
            { icon: Video, label: "Video", action: () => onCall(false) },
            { icon: UserPlus, label: "Add", action: () => setShowAdd(true) },
            { icon: Search, label: "Search", action: () => setSearching(true) },
          ].map(({ icon: Icon, label, action }) => (
            <button key={label} type="button" onClick={action} className="flex w-[72px] flex-col items-center gap-1.5 rounded-2xl border border-border py-3 text-sm hover:bg-secondary">
              <Icon className="h-5 w-5 text-primary" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {(group.description || creator) && (
        <div className="border-t border-border px-5 py-4">
          {group.description && <p className="whitespace-pre-wrap break-words text-[15px] text-muted-foreground">{group.description}</p>}
          <p className="mt-2 text-sm text-muted-foreground">
            Created by {creator?.id === currentUserId ? "you" : creator?.full_name || "someone"}, {format(new Date(group.created_at), "dd/MM/yyyy")}
          </p>
        </div>
      )}

      {/* Members */}
      <div className="border-t border-border px-2 pb-6 pt-3">
        <div className="flex items-center justify-between px-3 pb-1">
          <p className="text-sm font-semibold text-muted-foreground">{members.length} {members.length === 1 ? "member" : "members"}</p>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Search members" onClick={() => setSearching((s) => !s)}>
            <Search className="h-5 w-5" />
          </Button>
        </div>
        {searching && (
          <div className="px-3 pb-2">
            <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members" aria-label="Search members" className="rounded-full" />
          </div>
        )}
        <button type="button" onClick={() => setShowAdd(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-secondary">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground"><UserPlus className="h-5 w-5" /></span>
          <span className="font-medium">Add people</span>
        </button>
        {shown.map((m) => {
          const you = m.id === currentUserId;
          const canManage = isAdmin && !you && m.id !== group.created_by && (m.role !== "admin" || isCreator);
          return (
            <div key={m.id} className="flex items-center gap-3 rounded-xl px-3 py-2">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => navigate(`/profile/${m.id}`)}>
                <Avatar className="h-11 w-11">
                  <AvatarImage src={m.avatar_url || undefined} />
                  <AvatarFallback>{m.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 truncate text-[15px] font-medium">{you ? "You" : m.full_name || "Anonymous"}</span>
              </button>
              {m.role === "admin" && (
                <span className="flex-shrink-0 rounded-md bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">Group admin</span>
              )}
              {canManage && (
                <ActionMenu>
                  <ActionMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0 rounded-full" aria-label={`Manage ${m.full_name || "member"}`}>
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </ActionMenuTrigger>
                  <ActionMenuContent align="end" title={m.full_name || "Member"}>
                    {m.role === "admin" ? (
                      <ActionMenuItem onSelect={() => changeRole(m, "member")}><ShieldOff className="h-4 w-4 mr-2" /> Dismiss as admin</ActionMenuItem>
                    ) : (
                      <ActionMenuItem onSelect={() => changeRole(m, "admin")}><ShieldCheck className="h-4 w-4 mr-2" /> Make group admin</ActionMenuItem>
                    )}
                    <ActionMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm({ kind: "remove", member: m })}>
                      <UserMinus className="h-4 w-4 mr-2" /> Remove {m.full_name?.split(" ")[0] || "them"}
                    </ActionMenuItem>
                  </ActionMenuContent>
                </ActionMenu>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => setConfirm({ kind: "leave" })} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-medium text-destructive hover:bg-destructive/10">
          <LogOut className="h-5 w-5" /> Exit group
        </button>
      </div>

      <AddGroupMembersDialog
        open={showAdd}
        onOpenChange={setShowAdd}
        groupId={group.id}
        groupName={group.name}
        currentUserId={currentUserId}
        memberIds={members.map((m) => m.id)}
        onAdded={onChanged}
      />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.kind === "remove" ? `Remove ${confirm.member.full_name || "this person"}?` : `Exit ${group.name}?`}
        description={confirm?.kind === "remove" ? "They'll lose access to the chat, posts and voice rooms." : "You'll stop getting this group's messages. You can join again later."}
        confirmLabel={confirm?.kind === "remove" ? "Remove" : "Exit"}
        onConfirm={() => {
          if (confirm?.kind === "remove") void removeMember(confirm.member);
          else void leave();
          setConfirm(null);
        }}
      />
    </div>
  );
};

export default GroupInfoPanel;
