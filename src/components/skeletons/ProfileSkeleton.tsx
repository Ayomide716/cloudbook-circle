import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

const ProfileSkeleton = () => (
  <div className="max-w-[1100px] mx-auto">
    {/* Cover Photo */}
    <Skeleton className="h-48 sm:h-72 w-full rounded-b-2xl skeleton-shimmer" />
    
    {/* Profile Header */}
    <div className="px-4 sm:px-8 -mt-16 sm:-mt-20 mb-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
        <Skeleton className="h-32 w-32 sm:h-40 sm:w-40 rounded-full ring-4 ring-background skeleton-shimmer" />
        <div className="flex-1 space-y-2 pb-2">
          <Skeleton className="h-7 w-48 skeleton-shimmer" />
          <Skeleton className="h-4 w-32 skeleton-shimmer" />
          <Skeleton className="h-4 w-64 skeleton-shimmer" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-lg skeleton-shimmer" />
          <Skeleton className="h-10 w-10 rounded-lg skeleton-shimmer" />
        </div>
      </div>
    </div>

    {/* Tabs */}
    <div className="px-4 sm:px-8 border-b border-border mb-4">
      <div className="flex gap-1">
        {["Posts", "About", "Friends", "Photos"].map((tab) => (
          <Skeleton key={tab} className="h-10 w-20 rounded-t-lg skeleton-shimmer" />
        ))}
      </div>
    </div>

    {/* Content */}
    <div className="px-4 sm:px-8 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
      <div className="space-y-4">
        <Card className="p-4 space-y-3">
          <Skeleton className="h-5 w-20 skeleton-shimmer" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-4 w-4 skeleton-shimmer" />
              <Skeleton className="h-4 w-40 skeleton-shimmer" />
            </div>
          ))}
        </Card>
      </div>
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="p-4 space-y-3 opacity-0 animate-fade-in" style={{ animationDelay: `${i * 120}ms`, animationFillMode: "forwards" }}>
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full skeleton-shimmer" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-32 skeleton-shimmer" />
                <Skeleton className="h-3 w-20 skeleton-shimmer" />
              </div>
            </div>
            <Skeleton className="h-4 w-full skeleton-shimmer" />
            <Skeleton className="h-40 w-full rounded-lg skeleton-shimmer" />
          </Card>
        ))}
      </div>
    </div>
  </div>
);

export default ProfileSkeleton;
