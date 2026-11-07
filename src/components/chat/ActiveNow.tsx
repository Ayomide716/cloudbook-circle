import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { OnlineFriend } from "@/hooks/use-online-friends";

/** Friends online now, as a row of faces above the chat list (Messenger's "Active now"). */
const ActiveNow = ({ people, onOpen }: { people: OnlineFriend[]; onOpen: (p: OnlineFriend) => void }) => {
  if (people.length === 0) return null;
  return (
    <section aria-label="Active now" className="mb-2">
      <h3 className="mb-1.5 px-1 text-[13px] font-semibold text-muted-foreground">Active now</h3>
      <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1 pt-0.5 scrollbar-hide sm:mx-0 sm:px-0">
        {people.map((p) => {
          const name = p.full_name || "Friend";
          return (
            <button key={p.id} type="button" onClick={() => onOpen(p)} className="flex w-[60px] shrink-0 flex-col items-center gap-1 text-center" aria-label={`Message ${name}, active now`}>
              <span className="relative">
                <Avatar className="h-[52px] w-[52px]">
                  <AvatarImage src={p.avatar_url || undefined} alt="" className="object-cover" />
                  <AvatarFallback>{name[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background bg-green-500" aria-hidden="true" />
              </span>
              <span className="w-full truncate text-xs font-medium">{name.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default ActiveNow;
