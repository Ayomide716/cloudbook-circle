import { format, isToday, isTomorrow } from "date-fns";
import { CalendarDays, CalendarPlus, Check, Download, FileText, MapPin } from "@/components/icons";
import { useMessageVotes } from "@/hooks/use-message-votes";
import { calendarLink, fileKind, fileSize, type ChatEvent, type ChatFile, type ChatPoll, type ChatQuote } from "@/lib/chat-extras";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/** A document in a chat: its kind, name and size; tap to open or save it. */
export const FileCard = ({ file, mine }: { file: ChatFile; mine: boolean }) => (
  <a href={file.url} target="_blank" rel="noopener noreferrer" download={file.name}
    className={cn("mb-1 flex min-w-[220px] max-w-[280px] items-center gap-3 rounded-md p-2.5", mine ? "bg-black/15" : "bg-black/5 dark:bg-white/5")}>
    <span className="relative flex h-11 w-9 shrink-0 items-center justify-center rounded-sm bg-white text-[9px] font-bold text-red-600 shadow-sm">
      <FileText className="absolute h-6 w-6 text-red-500/25" aria-hidden="true" />
      <span className="relative mt-3">{fileKind(file.name)}</span>
    </span>
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[14px] font-medium">{file.name}</span>
      <span className="block text-xs opacity-70">{[fileSize(file.size), fileKind(file.name)].filter(Boolean).join(" · ")}</span>
    </span>
    <Download className="h-5 w-5 shrink-0 opacity-70" aria-label="Open" />
  </a>
);

/** A poll: tap an option to vote (again to take it back), with live counts as on WhatsApp. */
export const PollCard = ({ messageId, poll, mine, currentUserId }: { messageId: string; poll: ChatPoll; mine: boolean; currentUserId: string }) => {
  const { votes, mine: myVotes, vote } = useMessageVotes(messageId, currentUserId);
  const voters = new Set(votes.map((v) => v.user_id)).size;
  const most = Math.max(1, ...poll.options.map((_, i) => votes.filter((v) => v.option === i).length));
  return (
    <div className="mb-1 min-w-[230px] max-w-[290px]">
      <p className="text-[15px] font-semibold leading-snug">{poll.question}</p>
      <p className="mb-2 text-xs opacity-70">{poll.multiple ? "Select one or more" : "Select one"}</p>
      <div className="space-y-2.5" role="group" aria-label="Poll options">
        {poll.options.map((opt, i) => {
          const count = votes.filter((v) => v.option === i).length;
          const picked = myVotes.includes(i);
          return (
            <button key={i} type="button" aria-pressed={picked} onClick={() => { haptic(8); void vote(i, !poll.multiple); }} className="block w-full text-left">
              <span className="flex items-center gap-2">
                <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", picked ? (mine ? "border-white bg-white text-primary" : "border-primary bg-primary text-primary-foreground") : "border-current opacity-60")}>
                  {picked && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 text-[14px]">{opt}</span>
                <span className="text-xs tabular-nums opacity-80">{count}</span>
              </span>
              <span className="ml-7 mt-1 block h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <span className={cn("block h-full rounded-full transition-[width] duration-300", mine ? "bg-white" : "bg-primary")} style={{ width: `${(count / most) * 100}%` }} />
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-xs opacity-70">{voters === 0 ? "No votes yet" : `${voters} ${voters === 1 ? "person" : "people"} voted`}</p>
    </div>
  );
};

const when = (d: Date) => `${isToday(d) ? "Today" : isTomorrow(d) ? "Tomorrow" : format(d, "EEE d MMM")}, ${format(d, "HH:mm")}`;

/** An event: when and where, going / can't go, and add to calendar. */
export const EventCard = ({ messageId, event, mine, currentUserId, otherName }: { messageId: string; event: ChatEvent; mine: boolean; currentUserId: string; otherName?: string | null }) => {
  const { votes, mine: myVotes, vote } = useMessageVotes(messageId, currentUserId);
  const start = new Date(event.starts_at);
  const theirs = votes.find((v) => v.user_id !== currentUserId);
  return (
    <div className="mb-1 min-w-[230px] max-w-[290px]">
      <div className={cn("flex gap-3 rounded-md p-2.5", mine ? "bg-black/15" : "bg-black/5 dark:bg-white/5")}>
        <span className={cn("flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-md", mine ? "bg-white/90 text-primary" : "bg-primary text-primary-foreground")}>
          <span className="text-[10px] font-bold uppercase leading-none">{format(start, "MMM")}</span>
          <span className="text-lg font-bold leading-tight">{format(start, "d")}</span>
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold leading-snug">{event.title}</span>
          <span className="mt-0.5 flex items-center gap-1 text-xs opacity-80"><CalendarDays className="h-3.5 w-3.5" />{when(start)}</span>
          {event.place && <span className="mt-0.5 flex items-center gap-1 text-xs opacity-80"><MapPin className="h-3.5 w-3.5" /><span className="truncate">{event.place}</span></span>}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {(["Going", "Can't go"] as const).map((label, i) => (
          <button key={label} type="button" aria-pressed={myVotes.includes(i)} onClick={() => { haptic(8); void vote(i, true); }}
            className={cn("h-9 rounded-full text-[13px] font-semibold transition-colors", myVotes.includes(i) ? (mine ? "bg-white text-primary" : "bg-primary text-primary-foreground") : "bg-black/10 dark:bg-white/10")}>
            {myVotes.includes(i) && <Check className="mr-1 inline h-3.5 w-3.5" strokeWidth={3} />}{label}
          </button>
        ))}
      </div>
      {theirs && <p className="mt-1.5 text-xs opacity-75">{otherName || "They"}: {theirs.option === 0 ? "going" : "can't go"}</p>}
      <a href={calendarLink(event)} target="_blank" rel="noopener noreferrer" className="mt-1.5 flex items-center justify-center gap-1 text-[13px] font-semibold underline-offset-2 hover:underline">
        <CalendarPlus className="h-4 w-4" /> Add to calendar
      </a>
    </div>
  );
};

/** "Replying privately" to a group message: the group message, quoted. */
export const QuoteBlock = ({ quote, mine }: { quote: ChatQuote; mine: boolean }) => (
  <div className={cn("mb-1 min-w-[160px] rounded-md border-l-4 px-2 py-1 text-[13px] leading-snug", mine ? "bg-black/15 border-white/70" : "bg-black/5 dark:bg-white/5 border-primary")}>
    <p className={cn("text-xs font-semibold", mine ? "opacity-90" : "text-primary")}>
      {quote.name}{quote.group_name ? ` · ${quote.group_name}` : ""}
    </p>
    <p className="line-clamp-3 opacity-80">{quote.text}</p>
  </div>
);
