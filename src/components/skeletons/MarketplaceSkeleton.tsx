import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

const MarketplaceSkeleton = () => (
  <div className="max-w-[1200px] mx-auto px-4 py-4 sm:py-6">
    <div className="flex items-center justify-between mb-6">
      <Skeleton className="h-8 w-36 skeleton-shimmer" />
      <Skeleton className="h-10 w-32 rounded-lg skeleton-shimmer" />
    </div>
    <div className="flex gap-3 mb-6 overflow-hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-24 rounded-full flex-shrink-0 skeleton-shimmer" />
      ))}
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Card key={i} className="overflow-hidden opacity-0 animate-fade-in" style={{ animationDelay: `${i * 60}ms`, animationFillMode: "forwards" }}>
          <Skeleton className="aspect-square w-full skeleton-shimmer" />
          <div className="p-3 space-y-1.5">
            <Skeleton className="h-5 w-20 skeleton-shimmer" />
            <Skeleton className="h-4 w-full skeleton-shimmer" />
            <Skeleton className="h-3 w-24 skeleton-shimmer" />
          </div>
        </Card>
      ))}
    </div>
  </div>
);

export default MarketplaceSkeleton;
