import { Skeleton } from "@/components/ui/skeleton";

/** One post: name and time, two lines of text, a full-width photo, the heart / comment / share row. */
export const PostSkeleton = ({ photo = true }: { photo?: boolean }) => (
  <div className="feed-section overflow-hidden rounded-2xl border border-border bg-card">
    <div className="flex items-center gap-2.5 px-4 pb-2.5 pt-3 sm:p-4">
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
    <div className="space-y-2 px-4 pb-3">
      <Skeleton className="h-3.5 w-11/12" />
      <Skeleton className="h-3.5 w-3/5" />
    </div>
    {photo && <Skeleton className="aspect-[4/3] w-full rounded-none" />}
    <div className="flex items-center gap-5 px-4 py-3">
      <Skeleton className="h-6 w-6 rounded-full" />
      <Skeleton className="h-6 w-6 rounded-full" />
      <Skeleton className="h-6 w-6 rounded-full" />
      <Skeleton className="ml-auto h-6 w-6 rounded-full" />
    </div>
  </div>
);

/**
 * Same layout as Home (under the app's header): the story bubbles, the "What's on your mind?"
 * row, the For you · Friends chips, then posts, so nothing jumps when the feed arrives.
 */
const FeedSkeleton = () => (
  <div className="max-w-[1400px] mx-auto px-0 sm:px-4 lg:px-6 pt-0 pb-4 sm:py-6" aria-busy="true" aria-label="Loading feed">
    <div className="feed-flush w-full max-w-[680px] mx-auto space-y-5 max-sm:space-y-0">
      <div className="feed-section">
        <div className="flex gap-3 overflow-hidden px-4 py-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex w-[66px] shrink-0 flex-col items-center gap-1.5">
              <Skeleton className="h-[66px] w-[66px] rounded-full" />
              <Skeleton className="h-2.5 w-12" />
            </div>
          ))}
        </div>
      </div>
      <div className="feed-section flex items-center gap-3 rounded-2xl border border-border bg-card p-3 px-4 sm:p-4">
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <span className="flex h-10 flex-1 items-center rounded-full bg-secondary px-4 text-[15px] text-muted-foreground" aria-hidden="true">What's on your mind?</span>
      </div>
      <div className="flex gap-2 px-4 py-3 sm:px-0" aria-hidden="true">
        <span className="inline-flex h-[34px] items-center rounded-full bg-foreground px-4 text-[14px] font-semibold text-background">For you</span>
        <span className="inline-flex h-[34px] items-center rounded-full bg-secondary px-4 text-[14px] font-semibold">Friends</span>
      </div>
      <PostSkeleton photo={false} />
      <PostSkeleton />
    </div>
  </div>
);

export default FeedSkeleton;
