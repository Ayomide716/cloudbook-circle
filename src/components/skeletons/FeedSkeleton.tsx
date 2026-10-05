import { Skeleton } from "@/components/ui/skeleton";

/** One post: name and time, two lines of text, a photo, the Like / Comment / Share row. */
const PostSkeleton = ({ photo = true }: { photo?: boolean }) => (
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
 * Same layout as the feed (under the app's header): "What's on your mind?", the stories
 * row of tall cards, then posts.
 */
const FeedSkeleton = () => (
  <div className="max-w-[1400px] mx-auto px-0 sm:px-4 lg:px-6 pt-0 pb-4 sm:py-6" aria-busy="true" aria-label="Loading feed">
    <div className="feed-flush space-y-5 max-sm:space-y-2 w-full max-w-[680px] mx-auto">
      <div className="feed-section bg-card border border-border/60 rounded-xl p-3 sm:p-4 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full shrink-0" />
        <span className="flex-1 text-[17px] text-muted-foreground" aria-hidden="true">What's on your mind?</span>
      </div>
      <div className="feed-section feed-stories">
        <div className="flex gap-3 overflow-hidden py-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="w-[104px] h-[172px] shrink-0 rounded-xl" />
          ))}
        </div>
      </div>
      <PostSkeleton />
      <PostSkeleton photo={false} />
    </div>
  </div>
);

export default FeedSkeleton;
