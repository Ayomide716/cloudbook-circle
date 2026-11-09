import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import VerifiedBadge from "@/components/VerifiedBadge";
import { cn } from "@/lib/utils";

interface PersonRowProps {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  /** A line under the name: "Online", "3 mutual friends", "Admin", "Liked your post"… */
  subtitle?: ReactNode;
  /** Green subtitle and a dot on the photo. */
  online?: boolean;
  verified?: boolean;
  /** A small badge over the photo's corner (e.g. their reaction). */
  badge?: ReactNode;
  /** Buttons on the right. */
  actions?: ReactNode;
  /** Instead of opening their profile (e.g. picking them in a search). */
  onSelect?: () => void;
  /** "sm" for dense lists in sheets. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * One person in a list, the same everywhere (friends, members, people who reacted, search):
 * photo, name, a grey line under it, and buttons on the right. The photo and name open their
 * profile.
 */
const PersonRow = ({ id, name, avatarUrl, subtitle, online, verified, badge, actions, onSelect, size = "md", className }: PersonRowProps) => {
  const label = name || "Someone";
  const body = (
    <>
      <span className="relative shrink-0">
        <Avatar className={size === "sm" ? "h-10 w-10" : "h-12 w-12"}>
          <AvatarImage src={avatarUrl || undefined} className="object-cover" />
          <AvatarFallback className="bg-secondary">{label[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        {online && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-background" aria-hidden />}
        {badge && <span className="absolute -bottom-1 -right-1">{badge}</span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate text-[15px] font-semibold">{label}</span>
          {verified && <span className="shrink-0"><VerifiedBadge size="sm" /></span>}
        </span>
        {subtitle && (
          <span className={cn("block truncate text-[13px]", online ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
            {subtitle}
          </span>
        )}
      </span>
    </>
  );
  const main = "flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left";
  return (
    <div className={cn("flex items-center gap-2 px-4 py-2", className)}>
      {onSelect ? (
        <button type="button" onClick={onSelect} className={main}>{body}</button>
      ) : (
        <Link to={`/profile/${id}`} className={main}>{body}</Link>
      )}
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
};

export default PersonRow;
