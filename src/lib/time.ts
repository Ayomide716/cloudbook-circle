/**
 * Facebook-style short times for post headers: "Just now", "5m", "9h", "3d",
 * then the date ("Oct 3", or "Oct 3, 2025" in another year).
 */
export function shortTime(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/** Compact counts like Facebook's: 99, 2.1K, 3M. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/**
 * Short "last seen" for a chat header, so it fits on a phone: "Active 5m ago",
 * "Active 3h ago", "Last seen yesterday", "Last seen Oct 3".
 */
export function lastSeen(value: string | Date | null | undefined, now: Date = new Date()): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
  if (minutes < 1) return "Active just now";
  if (minutes < 60) return `Active ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Active ${hours}h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Last seen yesterday";
  return `Last seen ${shortTime(date, now)}`;
}
