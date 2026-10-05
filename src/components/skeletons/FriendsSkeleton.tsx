import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { RowSkeleton, StaticSearch } from "./parts";

const TABS = ["Requests", "Sent", "Friends", "Suggested"];

/** Same layout as the Friends page: title, search, the tab row, then people. */
const FriendsSkeleton = () => (
  <div className="page-flush max-w-[1000px] mx-auto px-0 sm:px-4 pb-6 sm:py-6" aria-busy="true" aria-label="Loading friends">
    <PageHeader title="Friends" className="sm:mb-4">
      <StaticSearch placeholder="Search people" />
    </PageHeader>
    <div className="feed-section flex h-11 items-stretch gap-1 border-b border-border bg-card sm:bg-transparent px-2 sm:px-0 mb-2 sm:mb-4" aria-hidden="true">
      {TABS.map((t) => (
        <span key={t} className="flex items-center px-3 text-[15px] font-semibold text-muted-foreground">{t}</span>
      ))}
    </div>
    <div className="feed-section bg-card divide-y divide-border sm:rounded-xl sm:border">
      {[[45, 30], [38, 25], [52, 28], [40, 32], [48, 26], [36, 30]].map((lines, i) => (
        <RowSkeleton key={i} lines={lines} avatar="h-14 w-14" right={<Skeleton className="h-9 w-20 rounded-lg" />} />
      ))}
    </div>
  </div>
);

export default FriendsSkeleton;
