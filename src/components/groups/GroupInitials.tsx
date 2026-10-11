import { groupColor, groupInitials } from "@/lib/group-tile";
import { cn } from "@/lib/utils";

/** Fills a group's picture spot (inside AvatarFallback) with its initials on its own colour. */
const GroupInitials = ({ id, name, className }: { id: string; name: string; className?: string }) => (
  <span
    className={cn("flex h-full w-full items-center justify-center font-display font-bold text-white", className)}
    style={{ backgroundImage: groupColor(id) }}
    aria-hidden="true"
  >
    {groupInitials(name)}
  </span>
);

export default GroupInitials;
