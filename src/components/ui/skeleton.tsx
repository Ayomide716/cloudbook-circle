import { cn } from "@/lib/utils";

/** A grey placeholder with a soft light sweep across it, like Facebook's loading screens. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton-shimmer rounded-md bg-muted", className)} {...props} />;
}

export { Skeleton };
