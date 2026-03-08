import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

const ConversationItemSkeleton = () => (
  <div className="flex items-center gap-3 p-3 sm:p-4">
    <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
    <div className="flex-1 min-w-0 space-y-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-12" />
      </div>
      <Skeleton className="h-3 w-40" />
    </div>
  </div>
);

const MessagesSkeleton = () => (
  <div className="fixed inset-0 flex flex-col bg-background">
    <div className="h-14" /> {/* Nav placeholder */}
    <div className="flex-1 flex overflow-hidden">
      <div className="container mx-auto px-0 sm:px-4 py-0 sm:py-4 flex-1 flex overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-0 sm:gap-4 flex-1 overflow-hidden">
          <Card className="md:col-span-1 flex flex-col rounded-none sm:rounded-lg overflow-hidden">
            <div className="p-3 sm:p-4 border-b">
              <Skeleton className="h-7 w-28 mb-3" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
            <div className="flex-1 divide-y divide-border">
              {Array.from({ length: 8 }).map((_, i) => (
                <ConversationItemSkeleton key={i} />
              ))}
            </div>
          </Card>
          <Card className="hidden md:flex md:col-span-2 rounded-none sm:rounded-lg items-center justify-center">
            <div className="text-center space-y-3">
              <Skeleton className="h-16 w-16 rounded-full mx-auto" />
              <Skeleton className="h-5 w-40 mx-auto" />
              <Skeleton className="h-4 w-56 mx-auto" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  </div>
);

export default MessagesSkeleton;
