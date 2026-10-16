import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "@/components/icons";
import { StaticChips } from "./parts";

/** One conversation row: avatar, name and time, last message (same sizes as the real row). */
const ConversationItemSkeleton = ({ nameWidth, textWidth }: { nameWidth: string; textWidth: string }) => (
  <div className="flex items-center gap-3 p-3 sm:p-4">
    <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
    <div className="flex-1 min-w-0 space-y-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4" style={{ width: nameWidth }} />
        <Skeleton className="h-3 w-9" />
      </div>
      <Skeleton className="h-3.5" style={{ width: textWidth }} />
    </div>
  </div>
);

const ROWS = [["38%", "62%"], ["30%", "48%"], ["44%", "70%"], ["34%", "55%"], ["40%", "44%"], ["28%", "66%"], ["36%", "52%"]];

/** Matches the Messages screen: under the app header, a title, the new-message button and the conversations. */
const MessagesSkeleton = () => (
  <div className="fixed inset-x-0 top-[calc(var(--nav-height)+env(safe-area-inset-top,0px))] max-md:top-[env(safe-area-inset-top,0px)] bottom-0 flex flex-col bg-background" aria-busy="true" aria-label="Loading messages">
    <div className="flex-1 flex overflow-hidden">
      <div className="container mx-auto px-0 sm:px-4 py-0 sm:py-4 flex-1 flex overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[360px_minmax(0,1fr)] gap-0 sm:gap-4 flex-1 overflow-hidden">
          <Card className="min-w-0 flex flex-col overflow-hidden max-md:border-0 max-md:!bg-transparent max-md:!bg-none max-md:!shadow-none">
            <div className="px-3 pt-3 pb-2.5 sm:p-4 md:border-b flex-shrink-0">
              {/* The real title and chips show straight away; only the conversations are grey. */}
              <div className="flex items-center gap-2 h-9" aria-hidden="true">
                <ArrowLeft className="md:hidden h-5 w-5" />
                <span className="text-[22px] font-bold tracking-tight">Messages</span>
              </div>
              <div className="mt-2.5">
                <StaticChips labels={["All", "Unread", "Groups"]} />
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="overflow-hidden">
                <ConversationItemSkeleton nameWidth="32%" textWidth="64%" />
                {ROWS.map(([name, text], i) => (
                  <ConversationItemSkeleton key={i} nameWidth={name} textWidth={text} />
                ))}
              </div>
            </div>
          </Card>
          <Card className="hidden md:flex min-w-0 rounded-none sm:rounded-lg items-center justify-center">
            <div className="text-center space-y-3">
              <Skeleton className="h-16 w-16 rounded-full mx-auto" />
              <Skeleton className="h-5 w-40 mx-auto" />
              <Skeleton className="h-4 w-56 mx-auto" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  </div>
);

export default MessagesSkeleton;
