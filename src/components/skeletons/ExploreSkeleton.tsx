import { Skeleton } from "@/components/ui/skeleton";
import { PostSkeleton } from "./FeedSkeleton";

/** Explore while it loads: trending topics, groups to join, people you may know, then posts. */
const ExploreSkeleton = () => (
  <div className="space-y-2 sm:space-y-4" aria-busy="true" aria-label="Loading Explore">
    <section className="feed-section bg-card px-3 py-3 sm:rounded-2xl sm:border sm:px-4">
      <Skeleton className="mb-3 h-4 w-32" />
      <div className="flex gap-2 overflow-hidden">
        {[72, 96, 64, 88, 70].map((w, i) => <Skeleton key={i} className="h-9 shrink-0 rounded-full" style={{ width: w }} />)}
      </div>
    </section>
    <section className="feed-section bg-card px-3 py-3 sm:rounded-2xl sm:border sm:px-4">
      <Skeleton className="mb-3 h-4 w-36" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="w-[150px] shrink-0 space-y-2">
            <Skeleton className="h-[90px] w-full rounded-xl" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </section>
    <section className="feed-section bg-card px-3 py-3 sm:rounded-2xl sm:border sm:px-4">
      <Skeleton className="mb-3 h-4 w-40" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex w-[130px] shrink-0 flex-col items-center gap-2 rounded-xl border border-border/60 p-3">
            <Skeleton className="h-14 w-14 rounded-full" />
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-8 w-full rounded-full" />
          </div>
        ))}
      </div>
    </section>
    <PostSkeleton photo={false} />
  </div>
);

export default ExploreSkeleton;
