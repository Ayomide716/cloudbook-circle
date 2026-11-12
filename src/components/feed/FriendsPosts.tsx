import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { usePostInteractions } from "@/hooks/use-post-interactions";
import { useFeedQuery, useFeedReactions } from "@/hooks/useFeedQuery";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { isFilteredOut } from "@/lib/hidden-posts";
import PostCard from "@/components/PostCard";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Loader2 } from "@/components/icons";

/**
 * Only your friends' posts, newest first: the "Posts" pill on the Friends screen. (Home is one
 * mixed feed; this is where the friends-only view lives, as Facebook keeps it off Home.)
 */
const FriendsPosts = ({ currentUserId }: { currentUserId: string }) => {
  const navigate = useNavigate();
  const { reactionsData, setReactionsData, commentsData, setCommentsData, toggleReaction, reloadComments } = usePostInteractions();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } = useFeedQuery(currentUserId, "friends");
  const { fetchReactions, fetchComments } = useFeedReactions(currentUserId);
  const posts = useMemo(() => (data?.pages.flatMap((page) => page.posts) ?? []).filter((p) => !isFilteredOut(p)), [data]);

  // Reactions and comments for the posts on screen.
  const idsKey = posts.map((p) => p.id).join(",");
  const loadExtras = useEffectEvent((ids: string[]) => Promise.all([fetchReactions(ids), fetchComments(ids)]));
  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    loadExtras(idsKey.split(",")).then(([reactions, comments]) => {
      if (cancelled) return;
      setReactionsData(reactions);
      setCommentsData(comments);
    });
    return () => { cancelled = true; };
  }, [idsKey, loadExtras, setReactionsData, setCommentsData]);

  // More as you near the end.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinel.current || !hasNextPage) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: "400px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (posts.length === 0) {
    return (
      <Card className="feed-section flat-list">
        <EmptyState
          emoji="people"
          title="No posts from friends yet"
          text="When your friends post, it'll show up here, newest first."
          action={<Button onClick={() => navigate("/")} variant="secondary" className="rounded-full px-5">Go to Home</Button>}
        />
      </Card>
    );
  }

  return (
    <div className="feed-flush space-y-2 sm:space-y-4">
      <p className="px-4 text-[13px] text-muted-foreground sm:px-0">Only posts from your friends, newest first.</p>
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          currentUserId={currentUserId}
          reactions={reactionsData[post.id]?.reactions || {}}
          userReaction={reactionsData[post.id]?.userReaction || null}
          firstReactorName={reactionsData[post.id]?.firstReactor}
          comments={commentsData[post.id] || []}
          onReactionToggle={(type) => toggleReaction(post.id, type)}
          onCommentAdded={() => reloadComments(post.id)}
          onDelete={() => refetch()}
        />
      ))}
      <div ref={sentinel} className="flex justify-center py-4">
        {isFetchingNextPage && <Loader2 className="h-6 w-6 animate-spin text-primary" />}
        {!hasNextPage && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Check className="h-4 w-4" /> That's everything from your friends.</p>
        )}
      </div>
    </div>
  );
};

export default FriendsPosts;
