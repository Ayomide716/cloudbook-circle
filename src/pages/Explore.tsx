import { useEffect, useRef, useState } from "react";
import { fetchPostInteractions, usePostInteractions } from "@/hooks/use-post-interactions";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import Navigation from "@/components/Navigation";
import { useToast } from "@/hooks/use-toast";
import PostCard from "@/components/PostCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PageHeader, PageSearch } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Hash, Users, Compass, Search, Flame, Star, Zap, Check, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import type { PostCardProps } from "@/components/PostCard";
import type { Tables } from "@/integrations/supabase/types";
import { useEffectEvent } from "@/hooks/use-effect-event";

interface TrendingTopic {
  tag: string;
  count: number;
}

const Explore = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  useSEO({ title: "Explore", description: "Discover trending content and new people on Ember." });
  const [currentUser, setCurrentUser] = useState<Tables<"profiles"> | null>(null);
  const [trendingPosts, setTrendingPosts] = useState<(PostCardProps["post"] & { score: number })[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<(Tables<"profiles"> & { mutualCount: number })[]>([]);
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState<string | null>(null);
  const searchSeq = useRef(0);
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  // The search box mirrors ?q= so hashtag/mention links (and shared URLs) open with results.
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") ?? "");
  const [searchResults, setSearchResults] = useState<{ posts: PostCardProps["post"][]; people: Tables<"profiles">[] } | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState("foryou");
  const { reactionsData, setReactionsData, commentsData, setCommentsData, toggleReaction, reloadComments } = usePostInteractions();

  const checkAuth = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    if (profile) {
      setCurrentUser(profile);
      loadContent(session.user.id);
    }
  });

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Follow ?q= when it changes from outside (e.g. clicking another hashtag).
  const urlQuery = searchParams.get("q") ?? "";
  useEffect(() => {
    setSearchQuery(urlQuery);
  }, [urlQuery]);

  const updateSearch = (value: string) => {
    setSearchQuery(value);
    setSearchParams(value.trim() ? { q: value } : {}, { replace: true });
  };

  const runSearch = useEffectEvent(async (query: string, userId: string) => {
    const seq = ++searchSeq.current;
    setIsSearching(true);
    // % and _ are wildcards in LIKE; search for them literally.
    const pattern = `%${query.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    // Characters with meaning inside a PostgREST `or` filter are dropped from that part of the search.
    const filterSafe = query.replace(/[,()*:"\\]/g, " ").trim();
    const [{ data: posts }, { data: people }] = await Promise.all([
      supabase
        .from("posts")
        .select(`*, profiles:user_id (id, full_name, avatar_url, is_verified)`)
        .ilike("content", pattern)
        .order("created_at", { ascending: false })
        .limit(30),
      // Mentions are written without spaces (@AliceJohnson), so match names loosely.
      supabase
        .from("profiles")
        .select("*")
        .or(`full_name.ilike.%${filterSafe}%,full_name.ilike.%${filterSafe.replace(/^@/, "").split(/(?=[A-Z])/).join("%")}%`)
        .neq("id", userId)
        .limit(12),
    ]);
    const found = posts ?? [];
    const extras = await fetchPostInteractions(found.map((p) => p.id), userId);
    // A slower reply to an older query must not replace the results for the newer one.
    if (seq !== searchSeq.current) return;
    setReactionsData((prev) => ({ ...prev, ...extras.reactions }));
    setCommentsData((prev) => ({ ...prev, ...extras.comments }));
    setSearchResults({ posts: found, people: people ?? [] });
    setIsSearching(false);
  });

  const trimmedQuery = searchQuery.trim();
  const currentUserId = currentUser?.id;
  useEffect(() => {
    if (!trimmedQuery || !currentUserId) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => runSearch(trimmedQuery, currentUserId), 300);
    return () => clearTimeout(timer);
  }, [trimmedQuery, currentUserId, runSearch]);

  const loadContent = async (userId: string) => {
    // Recent posts from the last week, ranked by engagement for Trending.
    const { data: posts } = await supabase
      .from("posts")
      .select(`*, profiles:user_id (id, full_name, avatar_url, is_verified)`)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    const recent = posts ?? [];
    const { reactions, comments } = await fetchPostInteractions(recent.map((p) => p.id), userId);
    const scored = recent.map((p) => {
      const reactionCount = Object.values(reactions[p.id]?.reactions ?? {}).reduce((sum, n) => sum + n, 0);
      return { ...p, score: reactionCount * 2 + (comments[p.id]?.length ?? 0) * 3 };
    });
    setTrendingPosts(scored);
    setReactionsData(reactions);
    setCommentsData(comments);

    // Extract trending topics from recent posts
    const tagCounts = new Map<string, number>();
    for (const post of recent) {
      // Count each tag once per post, so one post repeating a tag doesn't make it trend.
      const tags = new Set((post.content?.match(/#\w+/g) ?? []).map((t) => t.toLowerCase()));
      tags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
    }
    setTrendingTopics(
      Array.from(tagCounts.entries()).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 8)
    );

    loadSuggestions(userId);
  };

  const loadSuggestions = async (userId: string) => {
    // Friends of friends first (needs the server function), then newer members.
    const { data: friendships } = await supabase.from("friendships").select("user_id, friend_id").or(`user_id.eq.${userId},friend_id.eq.${userId}`);
    const connected = new Set([userId, ...(friendships || []).flatMap((f) => [f.user_id, f.friend_id])]);

    const { data: mutual, error } = await supabase.rpc("friend_suggestions", { _limit: 12 });
    const mutualCounts = new Map<string, number>();
    if (!error) for (const row of mutual ?? []) mutualCounts.set(row.user_id, Number(row.mutual_count));

    const [{ data: mutualProfiles }, { data: recentProfiles }] = await Promise.all([
      mutualCounts.size
        ? supabase.from("profiles").select("*").in("id", [...mutualCounts.keys()])
        : Promise.resolve({ data: [] as Tables<"profiles">[] }),
      supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(50),
    ]);

    const seen = new Set<string>();
    const list = [...(mutualProfiles ?? []), ...(recentProfiles ?? [])]
      .filter((u) => !connected.has(u.id) && !seen.has(u.id) && seen.add(u.id))
      .map((u) => ({ ...u, mutualCount: mutualCounts.get(u.id) ?? 0 }))
      .sort((a, b) => b.mutualCount - a.mutualCount)
      .slice(0, 12);
    setSuggestedUsers(list);
  };

  const sendRequest = async (userId: string) => {
    if (!currentUser || addingId) return;
    setAddingId(userId);
    const { error } = await supabase.from("friendships").insert({ user_id: currentUser.id, friend_id: userId, status: "pending" });
    setAddingId(null);
    if (error) {
      toast({ title: "Couldn't send friend request", description: error.message, variant: "destructive" });
      return;
    }
    setRequested((prev) => new Set(prev).add(userId));
  };

  // "For You": newest first. "Trending": only posts people have engaged with, best first.
  const rankedPosts = [...trendingPosts].filter((p) => p.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);

  if (!currentUser) return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="flex items-center justify-center h-[60vh]">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-8 h-8 rounded-lg bg-primary" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation currentUserId={currentUser.id} />
      <div className="page-flush flex-1 max-w-3xl mx-auto w-full px-0 sm:px-4 pb-6 sm:py-6">
        <PageHeader title="Explore" className="sm:mb-4">
          <PageSearch value={searchQuery} onChange={updateSearch} placeholder="Search topics, people, content" label="Search posts and people" />
        </PageHeader>

        {trimmedQuery ? (
          <div className="space-y-6 pt-3 sm:pt-0">
            {isSearching && (
              <p className="text-sm text-muted-foreground text-center py-2 flex items-center justify-center gap-2" role="status">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </p>
            )}
            {searchResults && searchResults.people.length > 0 && (
              <section className="px-3 sm:px-0">
                <h3 className="font-semibold text-sm flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4 text-primary" /> People
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {searchResults.people.map((user) => (
                    <Link key={user.id} to={`/profile/${user.id}`}>
                      <Card className="p-4 text-center hover:shadow-md transition-shadow h-full">
                        <Avatar className="h-14 w-14 mx-auto mb-2">
                          <AvatarImage src={user.avatar_url || undefined} alt="" />
                          <AvatarFallback className="bg-primary/10 text-primary text-lg">{user.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                        </Avatar>
                        <p className="font-semibold text-sm line-clamp-1 break-all">{user.full_name || "User"}</p>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            {searchResults && searchResults.posts.length > 0 && (
              <section className="space-y-2 sm:space-y-4">
                <h3 className="font-semibold text-sm flex items-center gap-2 px-3 sm:px-0">
                  <Hash className="h-4 w-4 text-primary" /> Posts
                </h3>
                {searchResults.posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUser.id}
                    reactions={reactionsData[post.id]?.reactions || {}}
                    userReaction={reactionsData[post.id]?.userReaction || null}
                    firstReactorName={reactionsData[post.id]?.firstReactor}
                    comments={commentsData[post.id] || []}
                    onReactionToggle={(type) => toggleReaction(post.id, type)}
                    onCommentAdded={() => reloadComments(post.id)}
                    onDelete={() => runSearch(trimmedQuery, currentUser.id)}
                  />
                ))}
              </section>
            )}
            {searchResults && !isSearching && searchResults.people.length === 0 && searchResults.posts.length === 0 && (
              <div className="text-center py-16">
                <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No results for “{trimmedQuery}”</p>
              </div>
            )}
          </div>
        ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="feed-section w-full grid grid-cols-3 bg-card sm:bg-transparent mb-2 sm:mb-4">
            <TabsTrigger value="foryou" className="gap-1.5 text-xs sm:text-sm">
              <Zap className="h-3.5 w-3.5" /> For You
            </TabsTrigger>
            <TabsTrigger value="trending" className="gap-1.5 text-xs sm:text-sm">
              <Flame className="h-3.5 w-3.5" /> Trending
            </TabsTrigger>
            <TabsTrigger value="people" className="gap-1.5 text-xs sm:text-sm">
              <Users className="h-3.5 w-3.5" /> People
            </TabsTrigger>
          </TabsList>

          <TabsContent value="foryou" className="space-y-2 sm:space-y-4">
            {trendingPosts.map((post, i) => (
              <motion.div key={post.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 5) * 0.05 }}>
                <PostCard
                  post={post}
                  currentUserId={currentUser.id}
                  reactions={reactionsData[post.id]?.reactions || {}}
                  userReaction={reactionsData[post.id]?.userReaction || null}
                  firstReactorName={reactionsData[post.id]?.firstReactor}
                  comments={commentsData[post.id] || []}
                  onReactionToggle={(type) => toggleReaction(post.id, type)}
                  onCommentAdded={() => reloadComments(post.id)}
                  onDelete={() => setTrendingPosts((prev) => prev.filter((p) => p.id !== post.id))}
                />
              </motion.div>
            ))}
            {trendingPosts.length === 0 && (
              <div className="text-center py-16">
                <Compass className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">No content to explore yet. Check back soon!</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="trending" className="space-y-2 sm:space-y-4">
            {trendingTopics.length > 0 && (
              <Card className="feed-section p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> Trending Topics
                </h3>
                <div className="flex flex-wrap gap-2">
                  {trendingTopics.map(t => (
                    <button key={t.tag} type="button" onClick={() => updateSearch(t.tag)} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Badge variant="secondary" className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors">
                        <Hash className="h-3 w-3 mr-1" /> {t.tag.replace("#", "")}
                        <span className="ml-1.5 text-[10px] opacity-70">{t.count} {t.count === 1 ? "post" : "posts"}</span>
                      </Badge>
                    </button>
                  ))}
                </div>
              </Card>
            )}
            {rankedPosts.map((post, i) => (
              <motion.div key={post.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 5) * 0.05 }}>
                <div className="flex items-start gap-2 mb-1">
                  <Badge variant="outline" className="text-[10px]">
                    <Flame className="h-2.5 w-2.5 mr-0.5" /> #{i + 1}
                  </Badge>
                </div>
                <PostCard
                  post={post}
                  currentUserId={currentUser.id}
                  reactions={reactionsData[post.id]?.reactions || {}}
                  userReaction={reactionsData[post.id]?.userReaction || null}
                  firstReactorName={reactionsData[post.id]?.firstReactor}
                  comments={commentsData[post.id] || []}
                  onReactionToggle={(type) => toggleReaction(post.id, type)}
                  onCommentAdded={() => reloadComments(post.id)}
                  onDelete={() => setTrendingPosts((prev) => prev.filter((p) => p.id !== post.id))}
                />
              </motion.div>
            ))}
            {rankedPosts.length === 0 && trendingTopics.length === 0 && (
              <div className="text-center py-16">
                <Flame className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Nothing is trending this week yet.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="people" className="space-y-3 px-3 sm:px-0">
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 text-gold" /> People you might know
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {suggestedUsers.map(user => (
                <Card key={user.id} className="p-4 text-center hover:shadow-md transition-shadow">
                  <Link to={`/profile/${user.id}`}>
                    <Avatar className="h-16 w-16 mx-auto mb-2">
                      <AvatarImage src={user.avatar_url || undefined} alt="" />
                      <AvatarFallback className="bg-primary/10 text-primary text-lg">{user.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                    </Avatar>
                    <p className="font-semibold text-sm line-clamp-1 break-all">{user.full_name || "User"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {user.mutualCount > 0 ? `${user.mutualCount} mutual ${user.mutualCount === 1 ? "friend" : "friends"}` : "New on Ember"}
                    </p>
                    {user.bio && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{user.bio}</p>}
                  </Link>
                  {requested.has(user.id) ? (
                    <Button size="sm" variant="secondary" className="mt-2 w-full text-xs h-8" disabled>
                      <Check className="h-3.5 w-3.5 mr-1" /> Requested
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full text-xs h-8"
                      disabled={addingId === user.id}
                      onClick={() => sendRequest(user.id)}
                      aria-label={`Add ${user.full_name || "user"} as a friend`}
                    >
                      {addingId === user.id && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                      Add Friend
                    </Button>
                  )}
                </Card>
              ))}
            </div>
            {suggestedUsers.length === 0 && (
              <div className="text-center py-12">
                <Users className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No suggestions right now</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
        )}
      </div>
    </div>
  );
};

export default Explore;
