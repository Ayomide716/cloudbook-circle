import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { RowSkeleton, StaticChips } from "./parts";

const LINES = [[80, 25], [65, 30], [90, 22], [70, 28], [85, 25], [60, 30], [75, 22], [68, 26]];

/** Same layout as the Notifications page: title and chips, then the list. */
const NotificationsSkeleton = () => (
  <div className="page-flush max-w-[800px] mx-auto px-0 sm:px-4 pb-6 sm:py-6" aria-busy="true" aria-label="Loading notifications">
    <PageHeader title="Notifications" className="sm:mb-4">
      <StaticChips labels={["All", "Unread"]} />
    </PageHeader>
    <Card className="feed-section overflow-hidden mt-2 sm:mt-0">
      <div className="divide-y divide-border">
        {LINES.map((lines, i) => (
          <RowSkeleton key={i} lines={lines} right={<Skeleton className="h-2.5 w-2.5 rounded-full" />} />
        ))}
      </div>
    </Card>
  </div>
);

export default NotificationsSkeleton;
