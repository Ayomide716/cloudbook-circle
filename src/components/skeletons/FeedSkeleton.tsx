import { Skeleton } from "@/components/ui/skeleton";

/** One post: name and time, two lines of text, a photo, the Like / Comment / Share row. */
export const PostSkeleton = ({ photo = true }: { photo?: boolean }) => (
  <div className="feed-section bg-card border border-border/60 rounded-2xl overflow-hidden">
    <div className="flex items-center gap-2.5 p-3 sm:p-4">
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
    <div className="px-3 sm:px-4 pb-3 space-y-2">
      <Skeleton className="h-3.5 w-11/12" />
      <Skeleton className="h-3.5 w-3/5" />
    </div>
    {photo && <Skeleton className="aspect-[4/3] w-full rounded-none" />}
    <div className="flex items-center gap-6 px-3 sm:px-4 py-3">
      <Skeleton className="h-5 w-12" />
      <Skeleton className="h-5 w-12" />
      <Skeleton className="h-5 w-6" />
    </div>
  </div>
);

/**
 * Same layout as Home (under the app's header): the "What's on your mind?" pill, the round
 * story bubbles, the For you · Friends tabs, then posts, so nothing jumps when the feed arrives.
 */
const FeedSkeleton = () => (
  <div className="max-w-[1400px] mx-auto px-0 sm:px-4 lg:px-6 pt-0 pb-4 sm:py-6" aria-busy="true" aria-label="Loading feed">
    <div className="feed-flush space-y-5 max-sm:space-y-2 w-full max-w-[680px] mx-auto">
      <div className="feed-section bg-card border border-border/60 p-3 sm:p-4 flex items-center gap-3 rounded-xl max-sm:!rounded-full max-sm:p-1.5">
        <Skeleton className="h-9 w-9 sm:h-10 sm:w-10 rounded-full shrink-0" />
        <span className="flex-1 text-[17px] text-muted-foreground" aria-hidden="true">What's on your mind?</span>
      </div>
      <div className="feed-section feed-stories">
        <div className="flex gap-3 overflow-hidden px-1 py-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex w-[68px] shrink-0 flex-col items-center gap-1.5">
              <Skeleton className="h-[66px] w-[66px] rounded-full" />
              <Skeleton className="h-2.5 w-12" />
            </div>
          ))}
        </div>
      </div>
      <div className="feed-section grid grid-cols-2 gap-1 rounded-2xl border border-border/60 bg-card p-1" aria-hidden="true">
        <span className="rounded-xl bg-primary/10 py-2 text-center text-[15px] font-semibold text-primary">For you</span>
        <span className="py-2 text-center text-[15px] font-semibold text-muted-foreground">Friends</span>
      </div>
      <PostSkeleton photo={false} />
      <PostSkeleton />
    </div>
  </div>
);

export default FeedSkeleton;
