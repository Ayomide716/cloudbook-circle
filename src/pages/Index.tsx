import { useEffect, useState, lazy, Suspense, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFeedQuery, useFeedReactions } from "@/hooks/useFeedQuery";
import Navigation from "@/components/Navigation";
import CreatePost from "@/components/CreatePost";
import PostCard from "@/components/PostCard";
import FeedFilter from "@/components/FeedFilter";
import PullToRefresh from "@/components/PullToRefresh";
import FeedSkeleton from "@/components/skeletons/FeedSkeleton";
import FeedSidebar from "@/components/FeedSidebar";
import { Loader2 } from "lucide-react";

const StoriesBar = lazy(() => import("@/components/StoriesBar"));

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [feedFilter, setFeedFilter] = useState<"all" | "friends">("all");
  const [reactionsData, setReactionsData] = useState<Record<string, { reactions: Record<string, number>; userReaction: string | null }>>({});
  const [commentsData, setCommentsData] = useState<Record<string, any[]>>({});
  const sentinelRef = useRef<HTMLDivElement>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useFeedQuery(currentUser?.id ?? null, feedFilter);

  const { fetchReactions, fetchComments } = useFeedReactions(currentUser?.id ?? null);

  const allPosts = data?.pages.flatMap((page) => page.posts) ?? [];

  // Load reactions/comments whenever posts change
  useEffect(() => {
    if (allPosts.length === 0 || !currentUser) return;
    const postIds = allPosts.map((p) => p.id);
    
    Promise.all([fetchReactions(postIds), fetchComments(postIds)]).then(
      ([reactions, comments]) => {
        setReactionsData(reactions);
        setCommentsData(comments);
      }
    );
  }, [allPosts.length, currentUser?.id]);

  // Infinite scroll observer
  useEffect(() => {
    if (!sentinelRef.current || !hasNextPage) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "400px" }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    checkAuth();
    const cleanup = setupRealtimeSubscription();
    return cleanup;
  }, [navigate]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (profile) setCurrentUser(profile);
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel("posts-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {
        refetch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleReactionToggle = async (postId: string, reactionType: string) => {
    if (!currentUser) return;
    const wasReaction = reactionsData[postId]?.userReaction;
    const currentReactions = { ...(reactionsData[postId]?.reactions || {}) };

    if (wasReaction) {
      currentReactions[wasReaction] = Math.max(0, (currentReactions[wasReaction] || 1) - 1);
    }
    if (wasReaction !== reactionType) {
      currentReactions[reactionType] = (currentReactions[reactionType] || 0) + 1;
    }

    setReactionsData((prev) => ({
      ...prev,
      [postId]: {
        reactions: currentReactions,
        userReaction: wasReaction === reactionType ? null : reactionType,
      },
    }));
  };

  const handleCommentAdded = async (postId: string) => {
    if (!currentUser) return;
    const { data: commentsResult } = await supabase
      .from("comments")
      .select(`*, profiles:user_id (id, full_name, avatar_url)`)
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    setCommentsData((prev) => ({
      ...prev,
      [postId]: commentsResult || [],
    }));
  };

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  if ((isLoading && allPosts.length === 0) || !currentUser) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <FeedSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation currentUserId={currentUser.id} />

      <PullToRefresh onRefresh={handleRefresh} className="flex-1 pb-safe">
        <div className="max-w-[1400px] mx-auto px-2 sm:px-4 lg:px-6 py-4 sm:py-6">
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] xl:grid-cols-[320px_1fr_320px] gap-6">
            <FeedSidebar currentUser={currentUser} />

            {/* Main Feed */}
            <main className="space-y-4 min-w-0">
              <Suspense fallback={<div className="h-24" />}>
                <StoriesBar currentUserId={currentUser.id} />
              </Suspense>

              <CreatePost
                currentUser={currentUser}
                onPostCreated={() => refetch()}
              />

              <FeedFilter filter={feedFilter} onFilterChange={setFeedFilter} />

              {allPosts.length === 0 ? (
                <div className="text-center py-12 animate-fade-in">
                  <p className="text-muted-foreground">No posts yet. Be the first to post!</p>
                </div>
              ) : (
                <>
                  {allPosts.map((post, index) => (
                    <div
                      key={post.id}
                      className="animate-fade-in"
                      style={{ animationDelay: `${Math.min(index, 5) * 60}ms`, animationFillMode: "forwards" }}
                    >
                    <PostCard
                      post={post}
                      currentUserId={currentUser.id}
                      reactions={reactionsData[post.id]?.reactions || {}}
                      userReaction={reactionsData[post.id]?.userReaction || null}
                      comments={commentsData[post.id] || []}
                      onReactionToggle={(type) => handleReactionToggle(post.id, type)}
                      onCommentAdded={() => handleCommentAdded(post.id)}
                      onDelete={() => refetch()}
                    />
                  ))}

                  {/* Infinite scroll sentinel */}
                  <div ref={sentinelRef} className="py-4 flex justify-center">
                    {isFetchingNextPage && (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    )}
                    {!hasNextPage && allPosts.length > 0 && (
                      <p className="text-sm text-muted-foreground">You're all caught up! 🎉</p>
                    )}
                  </div>
                </>
              )}
            </main>

            {/* Right Sidebar - Contacts */}
            <aside className="hidden lg:block">
              <div className="sticky top-20 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-[17px] text-muted-foreground">Contacts</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">Your friends will appear here</p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </PullToRefresh>
    </div>
  );
};

export default Index;
