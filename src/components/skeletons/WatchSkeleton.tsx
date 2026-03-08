import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

const WatchSkeleton = () => (
  <div className="max-w-[1200px] mx-auto px-4 py-4 sm:py-6">
    <div className="flex items-center justify-between mb-6">
      <Skeleton className="h-8 w-24 skeleton-shimmer" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-20 rounded-full skeleton-shimmer" />
        <Skeleton className="h-9 w-20 rounded-full skeleton-shimmer" />
        <Skeleton className="h-9 w-20 rounded-full skeleton-shimmer" />
      </div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="overflow-hidden opacity-0 animate-fade-in" style={{ animationDelay: `${i * 80}ms`, animationFillMode: "forwards" }}>
          <Skeleton className="aspect-video w-full skeleton-shimmer" />
          <div className="p-3 space-y-2">
            <div className="flex gap-3">
              <Skeleton className="h-9 w-9 rounded-full flex-shrink-0 skeleton-shimmer" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-full skeleton-shimmer" />
                <Skeleton className="h-3 w-28 skeleton-shimmer" />
                <Skeleton className="h-3 w-20 skeleton-shimmer" />
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  </div>
);

export default WatchSkeleton;
