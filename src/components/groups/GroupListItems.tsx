import { useState } from "react";
import { Check, Loader2, Users, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { GroupChatSummary, GroupInvite } from "@/lib/group-chats";
import { cn } from "@/lib/utils";

/** A group in the chat list: picture, name, "Ada: latest message", time and unread count. */
export const GroupChatRow = ({
  chat, currentUserId, selected, time, onOpen,
}: { chat: GroupChatSummary; currentUserId: string; selected: boolean; time?: string; onOpen: () => void }) => {
  const last = chat.lastMessage;
  const who = last ? (last.user_id === currentUserId ? "You" : last.senderName?.split(" ")[0] || "Someone") : null;
  const unread = chat.unread > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn("flex w-full items-center gap-3 p-3 text-left transition-colors sm:p-4", selected ? "bg-accent" : "hover:bg-accent/50 active:bg-accent/60")}
    >
      <Avatar className="h-12 w-12 flex-shrink-0">
        <AvatarImage src={chat.group.image_url || undefined} className="object-cover" />
        <AvatarFallback className="bg-secondary"><Users className="h-5 w-5 text-muted-foreground" /></AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold">{chat.group.name}</span>
          {time && <span className={cn("flex-shrink-0 text-[11px]", unread ? "font-semibold text-primary" : "text-muted-foreground")}>{time}</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-1">
          <span className={cn("flex-1 truncate text-sm", unread ? "font-medium text-foreground" : "text-muted-foreground")}>
            {last ? `${who}: ${last.content}` : "Group created · say hello"}
          </span>
          {unread && (
            <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground" aria-label={`${chat.unread} unread`}>
              {chat.unread > 99 ? "99+" : chat.unread}
            </span>
          )}
        </span>
      </span>
    </button>
  );
};

/** Group invites waiting for you, with Accept and Decline (as on WhatsApp). */
export const GroupInviteCards = ({ invites, onAnswered }: { invites: GroupInvite[]; onAnswered: (groupId: string, accepted: boolean) => void }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const answer = async (invite: GroupInvite, accept: boolean) => {
    setBusy(invite.group.id);
    const { error } = await supabase.rpc(accept ? "accept_group_invite" : "decline_group_invite", { _group: invite.group.id });
    setBusy(null);
    if (error) {
      toast({ title: accept ? "Couldn't join the group" : "Couldn't decline", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: accept ? `You joined ${invite.group.name}` : "Invite declined" });
    onAnswered(invite.group.id, accept);
  };
  return (
    <div className="mb-3 space-y-2" aria-label="Group invites">
      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Group invites</p>
      {invites.map((inv) => (
        <div key={inv.group.id} className="shine-card flex items-center gap-3 rounded-[1.125rem] border bg-card p-3">
          <Avatar className="h-11 w-11 flex-shrink-0">
            <AvatarImage src={inv.group.image_url || undefined} className="object-cover" />
            <AvatarFallback className="bg-secondary"><Users className="h-5 w-5 text-muted-foreground" /></AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{inv.group.name}</p>
            <p className="truncate text-xs text-muted-foreground">{inv.invitedBy.full_name || "Someone"} invited you</p>
          </div>
          <Button size="icon" variant="secondary" className="h-9 w-9 rounded-full" disabled={busy === inv.group.id} onClick={() => answer(inv, false)} aria-label={`Decline invite to ${inv.group.name}`}>
            <X className="h-4 w-4" />
          </Button>
          <Button size="sm" className="h-9 rounded-full px-3.5" disabled={busy === inv.group.id} onClick={() => answer(inv, true)} aria-label={`Join ${inv.group.name}`}>
            {busy === inv.group.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1 h-4 w-4" /> Join</>}
          </Button>
        </div>
      ))}
    </div>
  );
};
