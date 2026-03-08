import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

const NotificationItemSkeleton = () => (
  <div className="flex items-start gap-3 p-4">
    <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-4 w-full max-w-[280px]" />
      <Skeleton className="h-3 w-20" />
    </div>
    <Skeleton className="h-3 w-3 rounded-full flex-shrink-0 mt-2" />
  </div>
);

const NotificationsSkeleton = () => (
  <div className="max-w-[800px] mx-auto px-4 py-4 sm:py-6">
    <div className="flex items-center justify-between mb-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-8 w-32 rounded-md" />
    </div>
    <Card className="overflow-hidden divide-y divide-border">
      {Array.from({ length: 8 }).map((_, i) => (
        <NotificationItemSkeleton key={i} />
      ))}
    </Card>
  </div>
);

export default NotificationsSkeleton;
