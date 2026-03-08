import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

const EventsSkeleton = () => (
  <div className="max-w-[1100px] mx-auto px-4 py-4 sm:py-6">
    <div className="flex items-center justify-between mb-6">
      <Skeleton className="h-8 w-28 skeleton-shimmer" />
      <Skeleton className="h-10 w-36 rounded-lg skeleton-shimmer" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="overflow-hidden opacity-0 animate-fade-in" style={{ animationDelay: `${i * 100}ms`, animationFillMode: "forwards" }}>
          <Skeleton className="h-40 w-full skeleton-shimmer" />
          <div className="p-4 space-y-2">
            <Skeleton className="h-4 w-28 skeleton-shimmer" />
            <Skeleton className="h-5 w-48 skeleton-shimmer" />
            <Skeleton className="h-3 w-36 skeleton-shimmer" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-9 w-24 rounded-lg skeleton-shimmer" />
              <Skeleton className="h-9 w-24 rounded-lg skeleton-shimmer" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  </div>
);

export default EventsSkeleton;
