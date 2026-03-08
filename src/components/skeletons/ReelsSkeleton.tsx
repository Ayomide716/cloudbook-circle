import { Skeleton } from "@/components/ui/skeleton";

const ReelsSkeleton = () => (
  <div className="fixed inset-0 bg-background flex items-center justify-center">
    <div className="w-full max-w-[420px] mx-auto h-full relative">
      <Skeleton className="absolute inset-0 skeleton-shimmer rounded-none sm:rounded-2xl" />
      {/* Bottom overlay */}
      <div className="absolute bottom-16 left-4 right-16 space-y-2">
        <Skeleton className="h-5 w-28 skeleton-shimmer" />
        <Skeleton className="h-4 w-48 skeleton-shimmer" />
        <Skeleton className="h-3 w-36 skeleton-shimmer" />
      </div>
      {/* Side actions */}
      <div className="absolute right-3 bottom-24 space-y-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <Skeleton className="h-10 w-10 rounded-full skeleton-shimmer" />
            <Skeleton className="h-3 w-6 skeleton-shimmer" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default ReelsSkeleton;
