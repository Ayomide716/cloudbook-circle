import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

const FriendsSkeleton = () => (
  <div className="max-w-[1000px] mx-auto px-4 py-4 sm:py-6">
    <Skeleton className="h-8 w-28 mb-6 skeleton-shimmer" />
    <div className="flex gap-2 mb-6">
      <Skeleton className="h-9 w-28 rounded-full skeleton-shimmer" />
      <Skeleton className="h-9 w-28 rounded-full skeleton-shimmer" />
      <Skeleton className="h-9 w-36 rounded-full skeleton-shimmer" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="p-4 opacity-0 animate-fade-in" style={{ animationDelay: `${i * 80}ms`, animationFillMode: "forwards" }}>
          <div className="flex items-center gap-3">
            <Skeleton className="h-16 w-16 rounded-full skeleton-shimmer" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32 skeleton-shimmer" />
              <Skeleton className="h-3 w-20 skeleton-shimmer" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-24 rounded-lg skeleton-shimmer" />
                <Skeleton className="h-8 w-24 rounded-lg skeleton-shimmer" />
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  </div>
);

export default FriendsSkeleton;
