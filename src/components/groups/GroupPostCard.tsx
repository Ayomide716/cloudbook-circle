import { Link } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ActionMenu, ActionMenuContent, ActionMenuItem, ActionMenuTrigger } from "@/components/ui/action-menu";
import { MoreHorizontal, Pin, Trash2 } from "@/components/icons";

export interface GroupPostView {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  pinned_at?: string | null;
  author: { full_name: string | null; avatar_url: string | null };
  /** Shown on the Groups feed, where posts come from many groups. */
  group?: { id: string; name: string };
}

interface GroupPostCardProps {
  post: GroupPostView;
  currentUserId: string;
  /** You manage the post's group: pin it, or delete anyone's post. */
  canManage?: boolean;
  onDelete?: (post: GroupPostView) => void;
  onTogglePin?: (post: GroupPostView) => void;
}

/** A group post, in the same flat style as Home's posts: author, words, then the photo edge to edge. */
const GroupPostCard = ({ post, currentUserId, canManage, onDelete, onTogglePin }: GroupPostCardProps) => {
  const mine = post.user_id === currentUserId;
  const canDelete = !!onDelete && (mine || canManage);
  const canPin = !!onTogglePin && canManage;
  const name = post.author.full_name || "Someone";

  return (
    <article className="feed-section border-y border-border/60 bg-card sm:rounded-2xl sm:border">
      <header className="flex items-start gap-3 px-4 pt-3">
        <Link to={`/profile/${post.user_id}`} className="shrink-0 rounded-full" aria-label={name}>
          <Avatar className="h-10 w-10">
            <AvatarImage src={post.author.avatar_url || undefined} alt="" />
            <AvatarFallback>{name[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px]">
            <Link to={`/profile/${post.user_id}`} className="font-semibold hover:underline">{name}</Link>
            {post.group && (
              <>
                <span className="text-muted-foreground"> in </span>
                <Link to={`/groups/${post.group.id}`} className="font-semibold hover:underline">{post.group.name}</Link>
              </>
            )}
          </p>
          <p className="flex items-center gap-1 text-[13px] text-muted-foreground">
            {post.pinned_at && (
              <>
                <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-medium">Pinned</span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <time dateTime={post.created_at}>{formatDistanceToNowStrict(new Date(post.created_at), { addSuffix: true })}</time>
          </p>
        </div>
        {(canDelete || canPin) && (
          <ActionMenu>
            <ActionMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-mr-2 h-9 w-9 shrink-0 rounded-full" aria-label="Post options">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </ActionMenuTrigger>
            <ActionMenuContent align="end" title="Post">
              {canPin && (
                <ActionMenuItem onSelect={() => onTogglePin!(post)}>
                  <Pin className="mr-2 h-4 w-4" /> {post.pinned_at ? "Unpin" : "Pin to the top"}
                </ActionMenuItem>
              )}
              {canDelete && (
                <ActionMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete!(post)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete post
                </ActionMenuItem>
              )}
            </ActionMenuContent>
          </ActionMenu>
        )}
      </header>

      {post.content && <p className="whitespace-pre-wrap break-words px-4 pt-2 text-[15px] leading-relaxed">{post.content}</p>}
      {post.image_url ? (
        <img src={post.image_url} alt="" loading="lazy" decoding="async" className="mt-3 max-h-[560px] w-full bg-secondary object-cover sm:rounded-b-2xl" />
      ) : (
        <div className="pb-3" />
      )}
    </article>
  );
};

export default GroupPostCard;
