import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

const GroupsSkeleton = () => (
  <div className="max-w-[1100px] mx-auto px-4 py-4 sm:py-6">
    <div className="flex items-center justify-between mb-6">
      <Skeleton className="h-8 w-32 skeleton-shimmer" />
      <Skeleton className="h-10 w-36 rounded-lg skeleton-shimmer" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="overflow-hidden opacity-0 animate-fade-in" style={{ animationDelay: `${i * 80}ms`, animationFillMode: "forwards" }}>
          <Skeleton className="h-32 w-full skeleton-shimmer" />
          <div className="p-4 space-y-2">
            <Skeleton className="h-5 w-40 skeleton-shimmer" />
            <Skeleton className="h-3 w-24 skeleton-shimmer" />
            <div className="flex items-center gap-2 pt-2">
              <div className="flex -space-x-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-7 w-7 rounded-full skeleton-shimmer ring-2 ring-background" />
                ))}
              </div>
              <Skeleton className="h-3 w-20 skeleton-shimmer" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  </div>
);

export default GroupsSkeleton;
