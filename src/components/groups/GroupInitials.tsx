import { groupInitials } from "@/lib/group-tile";
import { cn } from "@/lib/utils";

/** Fills a group's picture spot (inside AvatarFallback) with its initials on plain grey (no coloured tiles). */
const GroupInitials = ({ id, name, className }: { id: string; name: string; className?: string }) => (
  <span
    className={cn("flex h-full w-full items-center justify-center bg-secondary font-display font-bold text-foreground", className)}
    data-group={id}
    aria-hidden="true"
  >
    {groupInitials(name)}
  </span>
);

export default GroupInitials;
