import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

const PostSkeleton = ({ delay = 0 }: { delay?: number }) => (
  <Card
    className="p-4 space-y-4 opacity-0 animate-fade-in"
    style={{ animationDelay: `${delay}ms`, animationFillMode: "forwards" }}
  >
    <div className="flex items-center gap-3">
      <Skeleton className="h-10 w-10 rounded-full skeleton-shimmer" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-4 w-32 skeleton-shimmer" />
        <Skeleton className="h-3 w-20 skeleton-shimmer" />
      </div>
    </div>
    <div className="space-y-2">
      <Skeleton className="h-4 w-full skeleton-shimmer" />
      <Skeleton className="h-4 w-3/4 skeleton-shimmer" />
    </div>
    <Skeleton className="h-48 w-full rounded-lg skeleton-shimmer" />
    <div className="flex justify-between pt-2">
      <Skeleton className="h-8 w-20 rounded-md skeleton-shimmer" />
      <Skeleton className="h-8 w-20 rounded-md skeleton-shimmer" />
      <Skeleton className="h-8 w-20 rounded-md skeleton-shimmer" />
    </div>
  </Card>
);

const StoriesSkeleton = () => (
  <div className="flex gap-3 overflow-hidden p-2">
    {Array.from({ length: 6 }).map((_, i) => (
      <div
        key={i}
        className="flex flex-col items-center gap-1.5 flex-shrink-0 opacity-0 animate-fade-in"
        style={{ animationDelay: `${i * 60}ms`, animationFillMode: "forwards" }}
      >
        <Skeleton className="h-16 w-16 rounded-full skeleton-shimmer" />
        <Skeleton className="h-3 w-12 skeleton-shimmer" />
      </div>
    ))}
  </div>
);

const SidebarSkeleton = () => (
  <div className="space-y-1">
    {Array.from({ length: 5 }).map((_, i) => (
      <div
        key={i}
        className="flex items-center gap-3 p-2 opacity-0 animate-fade-in"
        style={{ animationDelay: `${i * 80}ms`, animationFillMode: "forwards" }}
      >
        <Skeleton className="h-9 w-9 rounded-full skeleton-shimmer" />
        <Skeleton className="h-4 w-24 skeleton-shimmer" />
      </div>
    ))}
  </div>
);

const FeedSkeleton = () => (
  <div className="max-w-[1400px] mx-auto px-2 sm:px-4 lg:px-6 py-4 sm:py-6">
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] xl:grid-cols-[320px_1fr_320px] gap-6">
      <aside className="hidden lg:block">
        <div className="sticky top-20">
          <SidebarSkeleton />
        </div>
      </aside>
      <div className="space-y-4">
        <StoriesSkeleton />
        <Skeleton className="h-24 w-full rounded-lg skeleton-shimmer" />
        {Array.from({ length: 3 }).map((_, i) => (
          <PostSkeleton key={i} delay={i * 120} />
        ))}
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
