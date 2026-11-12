import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { StaticAction, StaticChips, StaticSearch } from "./parts";
import { PostSkeleton } from "./FeedSkeleton";

/** Same layout as the Groups page's feed: title with +, search, chips, your groups as round tiles, then posts. */
const GroupsSkeleton = () => (
  <div className="page-flush max-w-[1200px] mx-auto px-0 sm:px-4 lg:px-6 pb-6 sm:py-6 space-y-2 sm:space-y-0" aria-busy="true" aria-label="Loading groups">
    <PageHeader title="Groups" actions={<StaticAction />}>
      <StaticSearch placeholder="Search groups" />
      <StaticChips labels={["For you", "Your groups", "Discover"]} />
    </PageHeader>
    <div className="mx-auto max-w-2xl space-y-2 sm:space-y-3">
      <div className="feed-section border-y border-border/60 bg-card py-2 sm:rounded-2xl sm:border">
        <div className="flex gap-3.5 overflow-hidden px-4 py-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex w-[72px] shrink-0 flex-col items-center gap-1.5">
              <Skeleton className="h-[64px] w-[64px] rounded-full" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      </div>
      <PostSkeleton photo={false} />
      <PostSkeleton />
    </div>
  </div>
);

export default GroupsSkeleton;
