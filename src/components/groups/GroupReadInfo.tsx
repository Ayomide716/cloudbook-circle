import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CheckCheck } from "@/components/icons";
import type { GroupMessage } from "@/lib/group-messages";
import type { GroupMember } from "./GroupInfoPanel";

/**
 * Message info in a group, as on WhatsApp: who has read your message (and when they last
 * looked), and who hasn't yet.
 */
const GroupReadInfo = ({ message, members, readTimes, currentUserId, onClose }: {
  message: GroupMessage | null;
  members: GroupMember[];
  readTimes: Record<string, string | null>;
  currentUserId: string;
  onClose: () => void;
}) => {
  const others = members.filter((m) => m.id !== currentUserId);
  const readers = message ? others.filter((m) => { const t = readTimes[m.id]; return !!t && t >= message.created_at; }) : [];
  const waiting = others.filter((m) => !readers.includes(m));
  const row = (m: GroupMember, sub: string) => (
    <li key={m.id} className="flex items-center gap-3 py-2">
      <Avatar className="h-9 w-9"><AvatarImage src={m.avatar_url || undefined} /><AvatarFallback>{m.full_name?.[0]?.toUpperCase() ?? "?"}</AvatarFallback></Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{m.full_name || "Member"}</span>
        <span className="block text-xs text-muted-foreground">{sub}</span>
      </span>
    </li>
  );
  return (
    <Dialog open={!!message} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[80dvh] flex-col sm:max-w-sm">
        <DialogHeader><DialogTitle>Message info</DialogTitle></DialogHeader>
        {message && (
          <div className="min-h-0 space-y-4 overflow-y-auto">
            <p className="line-clamp-3 rounded-xl bg-chat-sent px-3 py-2 text-[15px] text-primary-foreground dark:text-white">{message.content}</p>
            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold"><CheckCheck className="h-4 w-4 text-sky-500" /> Read by {readers.length} of {others.length}</h3>
              <ul className="divide-y">{readers.map((m) => row(m, `Seen ${format(new Date(readTimes[m.id]!), "d MMM, HH:mm")}`))}</ul>
            </section>
            {waiting.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold text-muted-foreground">Not read yet</h3>
                <ul className="divide-y">{waiting.map((m) => row(m, "Hasn't opened the chat since"))}</ul>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default GroupReadInfo;
