import { Skeleton } from "@/components/ui/skeleton";

const PostSkeleton = () => (
  <div className="bento-card p-4 space-y-4">
    <div className="flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-xl skeleton-shimmer" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-4 w-32 skeleton-shimmer" />
        <Skeleton className="h-3 w-20 skeleton-shimmer" />
      </div>
    </div>
    <div className="space-y-2">
      <Skeleton className="h-4 w-full skeleton-shimmer" />
      <Skeleton className="h-4 w-3/4 skeleton-shimmer" />
    </div>
    <Skeleton className="h-48 w-full rounded-xl skeleton-shimmer" />
    <div className="flex justify-between pt-2">
      <Skeleton className="h-8 w-20 rounded-xl skeleton-shimmer" />
      <Skeleton className="h-8 w-20 rounded-xl skeleton-shimmer" />
      <Skeleton className="h-8 w-20 rounded-xl skeleton-shimmer" />
    </div>
  </div>
);

const StoriesSkeleton = () => (
  <div className="flex gap-3 overflow-hidden p-2">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0">
        <Skeleton className="h-16 w-16 rounded-xl skeleton-shimmer" />
        <Skeleton className="h-3 w-12 skeleton-shimmer" />
      </div>
    ))}
  </div>
);

const SidebarSkeleton = () => (
  <div className="space-y-1">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 p-2.5">
        <Skeleton className="h-8 w-8 rounded-xl skeleton-shimmer" />
        <Skeleton className="h-4 w-24 skeleton-shimmer" />
      </div>
    ))}
  </div>
);

const FeedSkeleton = () => (
  <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6">
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] xl:grid-cols-[280px_1fr_280px] gap-6">
      <aside className="hidden lg:block">
        <div className="sticky top-20">
          <SidebarSkeleton />
        </div>
      </aside>
      <div className="space-y-4">
        <StoriesSkeleton />
        <Skeleton className="h-24 w-full rounded-2xl skeleton-shimmer" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><PostSkeleton /></div>
          <PostSkeleton />
          <PostSkeleton />
        </div>
      </div>
      <aside className="hidden lg:block">
        <div className="sticky top-20">
          <SidebarSkeleton />
        </div>
      </aside>
    </div>
  </div>
);

export default FeedSkeleton;