import { Search } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Still copies of the page header's search box, chips and tabs. Loading screens show the
 * page's real title and controls straight away (as Facebook does) and grey out only the
 * content that's still on its way.
 */

export const StaticSearch = ({ placeholder }: { placeholder: string }) => (
  <div className="relative flex h-10 items-center rounded-full bg-secondary pl-10 text-[15px] text-muted-foreground" aria-hidden="true">
    <Search className="absolute left-3.5 h-4 w-4" />
    {placeholder}
  </div>
);

export const StaticChips = ({ labels }: { labels: string[] }) => (
  <div className="-mx-4 flex gap-2 overflow-hidden px-4 sm:mx-0 sm:px-0" aria-hidden="true">
    {labels.map((label, i) => (
      <span
        key={label}
        className={cn(
          "inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-semibold",
          i === 0 ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"
        )}
      >
        {label}
      </span>
    ))}
  </div>
);

/** A grey round button, where the header's action button will be. */
export const StaticAction = () => <Skeleton className="h-10 w-10 rounded-full" />;

/** A person/notification row: avatar, two lines of text, something on the right. */
export const RowSkeleton = ({ lines = [55, 30], avatar = "h-12 w-12", right }: { lines?: number[]; avatar?: string; right?: React.ReactNode }) => (
  <div className="flex items-center gap-3 px-4 py-3">
    <Skeleton className={cn("shrink-0 rounded-full", avatar)} />
    <div className="flex-1 min-w-0 space-y-2">
      {lines.map((w, i) => (
        <Skeleton key={i} className={i === 0 ? "h-4" : "h-3"} style={{ width: `${w}%` }} />
      ))}
    </div>
    {right}
  </div>
);
