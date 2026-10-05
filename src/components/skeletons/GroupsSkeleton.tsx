import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { StaticAction, StaticChips, StaticSearch } from "./parts";

/** One group, as on the Groups page: icon, name, members and privacy, description. */
const GroupCardSkeleton = () => (
  <div className="feed-section bg-card border border-border/60 rounded-2xl p-4 space-y-3">
    <div className="flex items-center gap-3">
      <Skeleton className="h-14 w-14 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-3.5 w-2/5" />
      </div>
    </div>
    <Skeleton className="h-3.5 w-11/12" />
    <div className="flex justify-end">
      <Skeleton className="h-9 w-16 rounded-full" />
    </div>
  </div>
);

/** Same layout as the Groups page: title with +, search, chips, then the groups. */
const GroupsSkeleton = () => (
  <div className="page-flush max-w-[1200px] mx-auto px-0 sm:px-4 lg:px-6 pb-6 sm:py-6 space-y-2 sm:space-y-0" aria-busy="true" aria-label="Loading groups">
    <PageHeader title="Groups" actions={<StaticAction />}>
      <StaticSearch placeholder="Search groups" />
      <StaticChips labels={["All", "Your groups", "Discover"]} />
    </PageHeader>
    <div className="grid gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 4 }).map((_, i) => <GroupCardSkeleton key={i} />)}
    </div>
  </div>
);

export default GroupsSkeleton;
