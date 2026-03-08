import { useEffect, useState, lazy, Suspense, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFeedQuery, useFeedReactions } from "@/hooks/useFeedQuery";
import { useAds } from "@/hooks/useAds";
import Navigation from "@/components/Navigation";
import CreatePost from "@/components/CreatePost";
import PostCard from "@/components/PostCard";
import FeedFilter from "@/components/FeedFilter";
import PullToRefresh from "@/components/PullToRefresh";
import FeedSkeleton from "@/components/skeletons/FeedSkeleton";
import FeedSidebar from "@/components/FeedSidebar";
import ContactsSidebar from "@/components/ContactsSidebar";
import SponsoredPost from "@/components/SponsoredPost";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import LoginStreakBadge from "@/components/LoginStreakBadge";
import ProfileCompletionPrompt from "@/components/ProfileCompletionPrompt";
import NewPostsBanner from "@/components/NewPostsBanner";

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
  const [lastFetchTime, setLastFetchTime] = useState(new Date());

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useFeedQuery(currentUser?.id ?? null, feedFilter);

  const { fetchReactions, fetchComments } = useFeedReactions(currentUser?.id ?? null);
  const { getAdForPosition } = useAds();

  const allPosts = data?.pages.flatMap((page) => page.posts) ?? [];

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
      navigate("/landing");
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
    setLastFetchTime(new Date());
  }, [refetch]);

  if ((isLoading && allPosts.length === 0) || !currentUser) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <FeedSkeleton />
      </div>
    );
  }

  // Bento grid sizing: alternate between full-width and half-width cards
  const getBentoSize = (index: number): "full" | "half" => {
    // Pattern: full, half, half, full, half, half...
    const pattern = index % 3;
    return pattern === 0 ? "full" : "half";
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation currentUserId={currentUser.id} />
      <NewPostsBanner onRefresh={handleRefresh} lastFetchTime={lastFetchTime} />

      <PullToRefresh onRefresh={handleRefresh} className="flex-1 pb-safe">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 mb-20 md:mb-24">
          <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] xl:grid-cols-[280px_1fr_280px] gap-6">
            <FeedSidebar currentUser={currentUser} />

            {/* Main Feed - Bento Grid */}
            <main className="space-y-5 min-w-0">
              <div className="flex items-center justify-between">
                <LoginStreakBadge userId={currentUser.id} />
              </div>

              <ProfileCompletionPrompt userId={currentUser.id} />

              <Suspense fallback={<div className="h-24" />}>
                <StoriesBar currentUserId={currentUser.id} />
              </Suspense>

              <CreatePost
                currentUser={currentUser}
                onPostCreated={() => refetch()}
              />

              <FeedFilter filter={feedFilter} onFilterChange={setFeedFilter} />

              {allPosts.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className="text-center py-16"
                >
                  <p className="text-muted-foreground text-lg">No posts yet. Be the first to share! ✨</p>
                </motion.div>
              ) : (
                <>
                  {/* Bento Grid Layout */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {allPosts.map((post, index) => {
                      const size = getBentoSize(index);
                      return (
                        <motion.div
                          key={post.id}
                          initial={{ opacity: 0, y: 20, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{
                            type: "spring",
                            stiffness: 260,
                            damping: 20,
                            delay: Math.min(index, 5) * 0.06,
                          }}
                          className={size === "full" ? "sm:col-span-2" : "sm:col-span-1"}
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
                        </motion.div>
                      );
                    })}
                  </div>

                  {/* Infinite scroll sentinel */}
                  <div ref={sentinelRef} className="py-4 flex justify-center">
                    {isFetchingNextPage && (
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    )}
                    {!hasNextPage && allPosts.length > 0 && (
                      <p className="text-sm text-muted-foreground">You're all caught up! 🎉</p>
                    )}
                  </div>
                </>
              )}
            </main>

            {/* Right Sidebar - Contacts */}
            <ContactsSidebar currentUserId={currentUser.id} />
          </div>
        </div>
      </PullToRefresh>
    </div>
  );
};

export default Index;