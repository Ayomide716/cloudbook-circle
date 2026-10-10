import { useEffect, useLayoutEffect, useState, lazy, Suspense, useCallback, useMemo, useRef } from "react";
import { usePostInteractions } from "@/hooks/use-post-interactions";
import { useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import { useFeedQuery, useFeedReactions } from "@/hooks/useFeedQuery";
import { useAds } from "@/hooks/useAds";
import Navigation from "@/components/Navigation";
import CreatePost from "@/components/CreatePost";
import PostCard from "@/components/PostCard";
import PullToRefresh from "@/components/PullToRefresh";
import FeedSkeleton from "@/components/skeletons/FeedSkeleton";
import FeedSidebar from "@/components/FeedSidebar";
import ContactsSidebar from "@/components/ContactsSidebar";
import SponsoredPost from "@/components/SponsoredPost";
import PeopleYouMayKnow from "@/components/feed/PeopleYouMayKnow";
import { GroupsRow, OnThisDay, ReelsRow } from "@/components/feed/FeedRows";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Loader2, UserPlus, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useLoginStreak } from "@/hooks/use-login-streak";
import { isFilteredOut } from "@/lib/hidden-posts";
import ProfileCompletionPrompt from "@/components/ProfileCompletionPrompt";
import NewPostsBanner from "@/components/NewPostsBanner";
import ScreenTimeWidget from "@/components/ScreenTimeWidget";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { TAB_RESELECT_EVENT } from "@/components/BottomNav";
import { haptic } from "@/lib/haptics";
import { playSound } from "@/lib/sounds";
import { dbChannel } from "@/lib/realtime";
import ReactionEmoji from "@/components/reactions/ReactionEmoji";

const StoriesBar = lazy(() => import("@/components/StoriesBar"));

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

const FEED_SCROLL_KEY = "cloudbook_feed_scroll";
const FEED_TAB_KEY = "cloudbook_feed_tab";
const FEED_VISIT_KEY = "cloudbook_feed_last_visit";

const Index = () => {
  const navigate = useNavigate();
  // Old post links were "/?post=<id>": send them to the post's own page.
  const [searchParams] = useSearchParams();
  const legacyPostId = searchParams.get("post");
  useEffect(() => {
    if (legacyPostId) navigate(`/post/${legacyPostId}`, { replace: true });
  }, [legacyPostId, navigate]);
  const { toast } = useToast();
  useSEO({ title: "Home", description: "Your Ember news feed - see updates from friends and community." });
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  // Opening the feed counts as today's visit; the streak itself shows on your profile.
  useLoginStreak(currentUser?.id);
  const { reactionsData, setReactionsData, commentsData, setCommentsData, toggleReaction, reloadComments } = usePostInteractions();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [lastFetchTime, setLastFetchTime] = useState(new Date());
  // "For you" (everyone, best first) or "Friends" (friends and you, newest first), remembered.
  const [feedTab, setFeedTab] = useState<"foryou" | "friends">(() => {
    try { return localStorage.getItem(FEED_TAB_KEY) === "friends" ? "friends" : "foryou"; } catch { return "foryou"; }
  });
  const chooseTab = (tab: "foryou" | "friends") => {
    setFeedTab(tab);
    try { localStorage.setItem(FEED_TAB_KEY, tab); } catch { /* fine */ }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // When you last opened the feed: posts older than that sit below "You're all caught up".
  const [previousVisit] = useState(() => {
    try { return localStorage.getItem(FEED_VISIT_KEY); } catch { return null; }
  });
  useEffect(() => {
    // Counts as a visit once you've been here a few seconds.
    const t = window.setTimeout(() => {
      try { localStorage.setItem(FEED_VISIT_KEY, new Date().toISOString()); } catch { /* fine */ }
    }, 5000);
    return () => window.clearTimeout(t);
  }, []);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    refetch,
  } = useFeedQuery(currentUser?.id ?? null, feedTab);

  const { fetchReactions, fetchComments } = useFeedReactions(currentUser?.id ?? null);
  const { getAdForPosition } = useAds();

  // Posts you hid or people you snoozed are left out when the feed loads. A post hidden
  // just now stays in place showing its "Why aren't you interested?" panel until the next load.
  // Keep your place: coming back to the feed (Back, or from a post or profile) puts you where
  // you were, as Facebook does, instead of at the top.
  const navigationType = useNavigationType();
  useEffect(() => {
    let frame = 0;
    const save = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Only while the feed is showing (the next page jumping to its top doesn't count).
        if (window.location.pathname !== "/") return;
        // Remember the post at the top of the screen and how far into it you were, so photos
        // and stories loading above it don't move you.
        const posts = document.querySelectorAll<HTMLElement>("[data-feed-post]");
        let anchor: { id: string; offset: number } | null = null;
        for (const el of posts) {
          const top = el.getBoundingClientRect().top;
          if (top + el.offsetHeight > 60) { anchor = { id: el.dataset.feedPost!, offset: top }; break; }
        }
        try { sessionStorage.setItem(FEED_SCROLL_KEY, JSON.stringify({ y: window.scrollY, anchor })); } catch { /* fine */ }
      });
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", save); };
  }, []);
  const restored = useRef(false);

  const allPosts = useMemo(() => (data?.pages.flatMap((page) => page.posts) ?? []).filter((p) => !isFilteredOut(p)), [data]);
  // The first post older than your last visit (only marked when there were newer ones above it).
  const caughtUpIndex = useMemo(() => {
    if (!previousVisit) return -1;
    const i = allPosts.findIndex((p) => p.created_at < previousVisit);
    return i > 0 ? i : -1;
  }, [allPosts, previousVisit]);

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
    const channel = dbChannel("posts-changes")
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


  useLayoutEffect(() => {
    if (restored.current || allPosts.length === 0) return;
    restored.current = true;
    let saved: { y: number; anchor: { id: string; offset: number } | null } | null = null;
    try { saved = JSON.parse(sessionStorage.getItem(FEED_SCROLL_KEY) ?? "null"); } catch { /* fine */ }
    if (navigationType !== "POP" || !saved || saved.y <= 0) return;
    const place = () => {
      const el = saved!.anchor && document.querySelector<HTMLElement>(`[data-feed-post="${saved!.anchor.id}"]`);
      if (el) window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - saved!.anchor!.offset);
      else window.scrollTo(0, saved!.y);
    };
    place();
    // Again as photos and stories take their space.
    const timers = [100, 400, 900].map((ms) => window.setTimeout(place, ms));
    const stop = () => timers.forEach(clearTimeout);
    window.addEventListener("touchstart", stop, { once: true, passive: true });
    window.addEventListener("wheel", stop, { once: true, passive: true });
  }, [allPosts.length, navigationType]);

  const handleRefresh = useCallback(async () => {
    await refetch();
    setLastFetchTime(new Date());
  }, [refetch]);

  // Tapping Home again while already at the top refreshes the feed.
  useEffect(() => {
    const onReselect = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== "/") return;
      haptic();
      void handleRefresh().then(() => playSound("refresh"));
    };
    window.addEventListener(TAB_RESELECT_EVENT, onReselect);
    return () => window.removeEventListener(TAB_RESELECT_EVENT, onReselect);
  }, [handleRefresh]);

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
      <NewPostsBanner onRefresh={handleRefresh} lastFetchTime={lastFetchTime} currentUserId={currentUser?.id} />

      <PullToRefresh onRefresh={handleRefresh} className="flex-1">
        <div className="max-w-[1400px] mx-auto px-0 sm:px-4 lg:px-6 pt-0 pb-4 sm:py-6 mb-20 md:mb-24 lg:mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_280px] gap-6">
            <FeedSidebar currentUser={currentUser} />

            {/* Main Feed - Bento Grid */}
            {/* Posts read best at about Facebook's width; wider just stretches photos and lines of text. */}
            <main className="feed-flush space-y-5 max-sm:space-y-2 min-w-0 w-full max-w-[680px] mx-auto">
              <CreatePost
                currentUser={currentUser}
                onPostCreated={() => void handleRefresh()}
              />

              <Suspense fallback={<div className="h-24" />}>
                <StoriesBar currentUserId={currentUser.id} />
              </Suspense>

              <ProfileCompletionPrompt userId={currentUser.id} />

              <OnThisDay currentUserId={currentUser.id} name={currentUser.full_name} avatarUrl={currentUser.avatar_url} />

              {/* For you · Friends, as on Instagram and Threads */}
              <div role="tablist" aria-label="Feed" className="flex gap-1 rounded-full border border-border bg-card p-1 shine-card">
                {([["foryou", "For you"], ["friends", "Friends"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={feedTab === value}
                    onClick={() => chooseTab(value)}
                    className={cn(
                      "h-9 flex-1 rounded-full text-[14px] font-semibold transition-colors",
                      feedTab === value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {allPosts.length === 0 ? (
                // Nothing to show yet (new here, or no friends' posts): a welcome with ways in,
                // then people to add, reels and groups, so the feed is never just blank.
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  className="space-y-2 sm:space-y-4"
                >
                  <section className="feed-section rounded-[1.125rem] border bg-card px-5 py-6 text-center">
                    <ReactionEmoji type="wave" className="mx-auto h-14 w-14 animate-[wave_1.6s_ease-in-out_1]" />
                    <h2 className="mt-2 text-lg font-semibold">
                      {feedTab === "friends" ? "No posts from friends yet" : `Welcome to Ember${currentUser.full_name ? `, ${currentUser.full_name.split(" ")[0]}` : ""}!`}
                    </h2>
                    <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                      {feedTab === "friends"
                        ? "Add some friends and their posts will show up here."
                        : "Add friends, join groups and share your first post. Your feed fills up as people you know post."}
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <Button className="rounded-full" onClick={() => navigate("/friends")}><UserPlus className="mr-1.5 h-4 w-4" /> Find friends</Button>
                      {feedTab === "friends" ? (
                        <Button variant="secondary" className="rounded-full" onClick={() => chooseTab("foryou")}>See For you</Button>
                      ) : (
                        <Button variant="secondary" className="rounded-full" onClick={() => navigate("/groups")}><Users className="mr-1.5 h-4 w-4" /> Explore groups</Button>
                      )}
                    </div>
                  </section>
                  <PeopleYouMayKnow currentUserId={currentUser.id} />
                  <ReelsRow />
                  <GroupsRow currentUserId={currentUser.id} />
                </motion.div>
              ) : (
                <>
                  {/* Bento Grid Layout */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
                    {allPosts.map((post, index) => {
                      const size = getBentoSize(index);
                      const ad = getAdForPosition(index);
                      return (
                        <motion.div
                          key={post.id}
                          data-feed-post={post.id}
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
                            <div className="mb-2 sm:mb-4">
                              <SponsoredPost campaign={ad} currentUserId={currentUser.id} />
                            </div>
                          )}
                          {/* Friends: posts you've already seen sit below a checkpoint, as on Instagram. */}
                          {feedTab === "friends" && index === caughtUpIndex && (
                            <div className="mb-2 flex flex-col items-center gap-1 py-5 text-center sm:mb-4" role="note">
                              <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-primary text-primary">
                                <Check className="h-6 w-6" strokeWidth={3} />
                              </span>
                              <p className="mt-1 font-semibold">You're all caught up</p>
                              <p className="text-sm text-muted-foreground">You've seen all new posts from your friends. Older posts are below.</p>
                            </div>
                          )}
                          {/* Rows between posts, as on Facebook */}
                          {index === 3 && (
                            <div className="mb-2 sm:mb-4">
                              <PeopleYouMayKnow currentUserId={currentUser.id} />
                            </div>
                          )}
                          {index === 7 && (
                            <div className="mb-2 sm:mb-4">
                              <ReelsRow />
                            </div>
                          )}
                          {index === 12 && (
                            <div className="mb-2 sm:mb-4">
                              <GroupsRow currentUserId={currentUser.id} />
                            </div>
                          )}
                          <PostCard
                            post={post}
                            currentUserId={currentUser.id}
                            reactions={reactionsData[post.id]?.reactions || {}}
                            userReaction={reactionsData[post.id]?.userReaction || null}
                            firstReactorName={reactionsData[post.id]?.firstReactor}
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

                  {/* A short feed never reaches the rows that sit between posts: show them after it. */}
                  {!hasNextPage && allPosts.length <= 12 && (
                    <div className="mt-2 space-y-2 sm:mt-4 sm:space-y-4">
                      {allPosts.length <= 3 && <PeopleYouMayKnow currentUserId={currentUser.id} />}
                      {allPosts.length <= 7 && <ReelsRow />}
                      <GroupsRow currentUserId={currentUser.id} />
                    </div>
                  )}

                  {/* Infinite scroll sentinel */}
                  <div ref={sentinelRef} className="py-4 flex justify-center">
                    {isFetchingNextPage && (
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    )}
                    {!hasNextPage && allPosts.length > 0 && (
                      feedTab === "friends" ? (
                        <div className="flex flex-col items-center gap-2 text-center">
                          <p className="text-sm text-muted-foreground">That's everything from your friends.</p>
                          <Button variant="secondary" className="rounded-full" onClick={() => chooseTab("foryou")}>See more in For you</Button>
                        </div>
                      ) : (
                        <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><ReactionEmoji type="party" className="h-5 w-5" /> You're all caught up!</p>
                      )
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