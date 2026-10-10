import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, toDate } from "@/lib/utils";

export interface ThreadComment {
  id: string;
  content: string;
  created_at: string | null;
  parent_id?: string | null;
  user_id?: string;
  profiles: { id?: string; full_name: string | null; avatar_url: string | null };
}

interface CommentThreadProps<T extends ThreadComment> {
  comments: T[];
  currentUserId?: string | null;
  /** Reply to a comment: `parent` is the top-level comment, `mention` who is being answered. */
  onReply: (parent: T, mention: string | null) => void;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, content: string) => Promise<void> | void;
  /** How many top-level comments to show before "View more comments". */
  initialCount?: number;
  /** A thread to open (e.g. the one you just replied in). */
  openThreadId?: string | null;
  className?: string;
}

const REPLY_PAGE = 5;

const ago = (iso: string | null) => {
  const s = formatDistanceToNowStrict(toDate(iso));
  // "5 minutes" → "5m", "2 hours" → "2h", as on Instagram and Facebook.
  const [n, unit] = s.split(" ");
  if (unit?.startsWith("second")) return "now";
  return `${n}${unit?.[0] === "m" && unit.startsWith("mo") ? "mo" : unit?.[0] ?? ""}`;
};

const authorId = (c: ThreadComment) => c.profiles.id ?? c.user_id ?? "";

/**
 * Comments with their replies folded away, as on Instagram and TikTok: each comment shows
 * "View 12 replies", which opens 5 at a time, so a comment with 300 replies doesn't become one
 * endless column. Replies to replies stay in the same thread, starting with "@Name".
 */
export function CommentThread<T extends ThreadComment>({
  comments,
  currentUserId,
  onReply,
  onDelete,
  onEdit,
  initialCount = 3,
  openThreadId,
  className,
}: CommentThreadProps<T>) {
  const { topLevel, repliesOf } = useMemo(() => {
    const ids = new Set(comments.map((c) => c.id));
    const top: T[] = [];
    const replies = new Map<string, T[]>();
    for (const c of comments) {
      // A reply whose parent is gone (deleted) shows as a normal comment.
      if (c.parent_id && ids.has(c.parent_id)) {
        const list = replies.get(c.parent_id) ?? [];
        list.push(c);
        replies.set(c.parent_id, list);
      } else {
        top.push(c);
      }
    }
    return { topLevel: top, repliesOf: replies };
  }, [comments]);

  const [shownTop, setShownTop] = useState(initialCount);
  // How many replies are showing for each thread (missing = folded).
  const [shownReplies, setShownReplies] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    if (!openThreadId) return;
    setShownReplies((s) => ({ ...s, [openThreadId]: Math.max(s[openThreadId] ?? 0, (repliesOf.get(openThreadId)?.length ?? 0)) }));
  }, [openThreadId, repliesOf]);

  const visibleTop = topLevel.slice(0, Math.max(shownTop, 0));
  const hiddenTop = topLevel.length - visibleTop.length;

  const renderComment = (c: T, parent: T, isReply: boolean) => {
    const mine = !!currentUserId && authorId(c) === currentUserId;
    const name = c.profiles.full_name || "Anonymous";
    const profileLink = authorId(c) ? `/profile/${authorId(c)}` : undefined;
    const isEditing = editing?.id === c.id;
    return (
      <div key={c.id} className="flex gap-2">
        {profileLink ? (
          <Link to={profileLink} className="flex-shrink-0">
            <Avatar className={isReply ? "h-7 w-7" : "h-8 w-8"}>
              <AvatarImage src={c.profiles.avatar_url || undefined} />
              <AvatarFallback className="bg-secondary text-[10px]">{name[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
          </Link>
        ) : (
          <Avatar className={cn("flex-shrink-0", isReply ? "h-7 w-7" : "h-8 w-8")}>
            <AvatarImage src={c.profiles.avatar_url || undefined} />
            <AvatarFallback className="bg-secondary text-[10px]">{name[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        )}
        <div className="min-w-0 flex-1">
          <div className="inline-block max-w-full rounded-2xl bg-secondary px-3 py-2">
            {profileLink ? (
              <Link to={profileLink} className="block text-[13px] font-semibold hover:underline">{name}</Link>
            ) : (
              <p className="text-[13px] font-semibold">{name}</p>
            )}
            {isEditing ? (
              <div className="mt-1 min-w-[200px]">
                <Textarea
                  value={editing.text}
                  onChange={(e) => setEditing({ id: c.id, text: e.target.value })}
                  className="min-h-[36px] resize-none py-1 text-sm"
                  autoFocus
                />
                <div className="mt-1 flex gap-1">
                  <Button
                    size="sm"
                    className="h-6 px-2 text-xs"
                    disabled={!editing.text.trim()}
                    onClick={async () => { await onEdit?.(c.id, editing.text.trim()); setEditing(null); }}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap break-words text-sm">{c.content}</p>
            )}
          </div>
          <div className="ml-3 mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{ago(c.created_at)}</span>
            <button type="button" className="font-semibold hover:text-foreground" onClick={() => onReply(parent, isReply ? name : null)}>
              Reply
            </button>
            {mine && onEdit && !isReply && !isEditing && (
              <button type="button" className="font-semibold hover:text-foreground" onClick={() => setEditing({ id: c.id, text: c.content })}>
                Edit
              </button>
            )}
            {mine && onDelete && (
              <button type="button" className="font-semibold hover:text-destructive" onClick={() => onDelete(c.id)}>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={cn("space-y-3", className)}>
      {visibleTop.map((c) => {
        const replies = repliesOf.get(c.id) ?? [];
        const shown = shownReplies[c.id] ?? 0;
        const remaining = replies.length - shown;
        return (
          <div key={c.id}>
            {renderComment(c, c, false)}
            {replies.length > 0 && (
              <div className="ml-10 mt-1.5 space-y-2">
                {replies.slice(0, shown).map((r) => renderComment(r, c, true))}
                <div className="flex items-center gap-3">
                  {remaining > 0 && (
                    <button
                      type="button"
                      className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                      onClick={() => setShownReplies((s) => ({ ...s, [c.id]: shown + REPLY_PAGE }))}
                    >
                      <span className="h-px w-6 bg-muted-foreground/50" aria-hidden="true" />
                      {shown === 0
                        ? `View ${remaining} ${remaining === 1 ? "reply" : "replies"}`
                        : `View ${remaining} more ${remaining === 1 ? "reply" : "replies"}`}
                    </button>
                  )}
                  {shown > 0 && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                      onClick={() => setShownReplies((s) => ({ ...s, [c.id]: 0 }))}
                    >
                      Hide replies
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {hiddenTop > 0 && (
        <button
          type="button"
          className="text-sm font-semibold text-muted-foreground hover:text-foreground"
          onClick={() => setShownTop((n) => n + 10)}
        >
          View {Math.min(hiddenTop, 10) === hiddenTop ? hiddenTop : 10} more {hiddenTop === 1 ? "comment" : "comments"}
        </button>
      )}
    </div>
  );
}
