import { useEffect, useState, lazy, Suspense, useCallback, useRef } from "react";
import { usePostInteractions } from "@/hooks/use-post-interactions";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
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
import MoodSelector from "@/components/MoodSelector";
import ScreenTimeWidget from "@/components/ScreenTimeWidget";
import { useEffectEvent } from "@/hooks/use-effect-event";

const StoriesBar = lazy(() => import("@/components/StoriesBar"));

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

const Index = () => {
  const navigate = useNavigate();
  // Old post links were "/?post=<id>": send them to the post's own page.
  const [searchParams] = useSearchParams();
  const legacyPostId = searchParams.get("post");
  useEffect(() => {
    if (legacyPostId) navigate(`/post/${legacyPostId}`, { replace: true });
  }, [legacyPostId, navigate]);
  const { toast } = useToast();
  useSEO({ title: "Home", description: "Your CloudBook news feed - see updates from friends and community." });
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [feedFilter, setFeedFilter] = useState<"all" | "friends" | "digest">("all");
  const { reactionsData, setReactionsData, commentsData, setCommentsData, toggleReaction, reloadComments } = usePostInteractions();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [lastFetchTime, setLastFetchTime] = useState(new Date());
  const [currentMood, setCurrentMood] = useState<string | null>(() => {
    return localStorage.getItem("cloudbook_mood") || null;
  });

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

  // Reload reactions/comments whenever the set of visible posts changes (not just their count,
  // which stays the same when switching feed filters).
  const postIdsKey = allPosts.map((p) => p.id).join(",");
  const currentUserId = currentUser?.id;
  const loadPostExtras = useEffectEvent((postIds: string[]) =>
    Promise.all([fetchReactions(postIds), fetchComments(postIds)])
  );

  useEffect(() => {
    if (!postIdsKey || !currentUserId) return;
    let cancelled = false;
    loadPostExtras(postIdsKey.split(",")).then(([reactions, comments]) => {
      if (cancelled) return;
      setReactionsData(reactions);
      setCommentsData(comments);
    });
    return () => {
      cancelled = true;
    };
  }, [postIdsKey, currentUserId, loadPostExtras, setReactionsData, setCommentsData]);

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

  const checkAuth = useEffectEvent(async () => {
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
  });

  const setupRealtimeSubscription = useEffectEvent(() => {
    const channel = supabase
      .channel("posts-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "posts" }, () => {
        refetch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  });

  useEffect(() => {
    checkAuth();
    const cleanup = setupRealtimeSubscription();
    return cleanup;
  }, [navigate, checkAuth, setupRealtimeSubscription]);

  const handleMoodChange = (mood: string | null) => {
    setCurrentMood(mood);
    if (mood) localStorage.setItem("cloudbook_mood", mood);
    else localStorage.removeItem("cloudbook_mood");
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

      <PullToRefresh onRefresh={handleRefresh} className="flex-1">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 mb-20 md:mb-24">
          <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_280px] gap-6">
            <FeedSidebar currentUser={currentUser} />

            {/* Main Feed - Bento Grid */}
            <main className="space-y-5 min-w-0">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <LoginStreakBadge userId={currentUser.id} />
                <MoodSelector currentMood={currentMood} onMoodChange={handleMoodChange} />
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {allPosts.map((post, index) => {
                      const size = getBentoSize(index);
                      const ad = getAdForPosition(index);
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
                          className={size === "full" ? "md:col-span-2" : "md:col-span-1"}
                        >
                          {ad && currentUser && (
                            <div className="mb-4">
                              <SponsoredPost campaign={ad} currentUserId={currentUser.id} />
                            </div>
                          )}
                          <PostCard
                            post={post}
                            currentUserId={currentUser.id}
                            reactions={reactionsData[post.id]?.reactions || {}}
                            userReaction={reactionsData[post.id]?.userReaction || null}
                            comments={commentsData[post.id] || []}
                            onReactionToggle={(type) => toggleReaction(post.id, type)}
                            onCommentAdded={() => reloadComments(post.id)}
                            onDelete={() => refetch()}
                            compact={size === "half"}
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
      <ScreenTimeWidget />
    </div>
  );
};

export default Index;