import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import Navigation from "@/components/Navigation";
import PostCard from "@/components/PostCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Hash, Users, Compass, Search, Flame, Star, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";

interface TrendingTopic {
  tag: string;
  count: number;
}

const Explore = () => {
  const navigate = useNavigate();
  useSEO({ title: "Explore", description: "Discover trending content and new people on CloudBook." });
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [trendingPosts, setTrendingPosts] = useState<any[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);
  const [trendingTopics, setTrendingTopics] = useState<TrendingTopic[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("foryou");
  const [reactionsData, setReactionsData] = useState<Record<string, any>>({});
  const [commentsData, setCommentsData] = useState<Record<string, any[]>>({});

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/landing"); return; }
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    if (profile) {
      setCurrentUser(profile);
      loadContent(session.user.id);
    }
  };

  const loadContent = async (userId: string) => {
    // Load trending posts (most reacted in last 7 days)
    const { data: posts } = await supabase
      .from("posts")
      .select(`*, profiles:user_id (id, full_name, avatar_url, is_verified)`)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(20);

    if (posts) {
      // Get reaction counts for these posts
      const postIds = posts.map(p => p.id);
      const { data: reactions } = await supabase.from("reactions").select("post_id, reaction_type, user_id").in("post_id", postIds);
      const { data: comments } = await supabase.from("comments").select("*, profiles:user_id (id, full_name, avatar_url)").in("post_id", postIds).order("created_at", { ascending: true });

      // Score posts by engagement
      const scored = posts.map(p => {
        const postReactions = reactions?.filter(r => r.post_id === p.id) || [];
        const postComments = comments?.filter(c => c.post_id === p.id) || [];
        return { ...p, score: postReactions.length * 2 + postComments.length * 3 };
      }).sort((a, b) => b.score - a.score);

      setTrendingPosts(scored);

      // Build reactions & comments maps
      const rMap: Record<string, any> = {};
      const cMap: Record<string, any[]> = {};
      postIds.forEach(id => {
        const pr = reactions?.filter(r => r.post_id === id) || [];
        const rc: Record<string, number> = {};
        pr.forEach(r => { rc[r.reaction_type] = (rc[r.reaction_type] || 0) + 1; });
        const ur = pr.find(r => r.user_id === userId);
        rMap[id] = { reactions: rc, userReaction: ur?.reaction_type || null };
        cMap[id] = comments?.filter(c => c.post_id === id) || [];
      });
      setReactionsData(rMap);
      setCommentsData(cMap);
    }

    // Load suggested users (not already friends)
    const { data: friendships } = await supabase.from("friendships").select("user_id, friend_id").or(`user_id.eq.${userId},friend_id.eq.${userId}`);
    const connectedIds = new Set([userId, ...(friendships || []).flatMap(f => [f.user_id, f.friend_id])]);

    const { data: users } = await supabase.from("profiles").select("*").limit(50);
    const suggestions = (users || []).filter(u => !connectedIds.has(u.id)).slice(0, 12);
    setSuggestedUsers(suggestions);

    // Extract trending topics from recent posts
    const allContent = (posts || []).map(p => p.content).join(" ");
    const hashtags = allContent.match(/#\w+/g) || [];
    const tagCounts = new Map<string, number>();
    hashtags.forEach(tag => tagCounts.set(tag.toLowerCase(), (tagCounts.get(tag.toLowerCase()) || 0) + 1));
    const topics = Array.from(tagCounts.entries()).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 8);
    setTrendingTopics(topics);
  };

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
      <div className="flex-1 max-w-3xl mx-auto w-full px-3 sm:px-4 py-4 sm:py-6 mb-20 md:mb-6">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search topics, people, content..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 rounded-full bg-secondary border-0 h-10" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-3 mb-4">
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

          <TabsContent value="foryou" className="space-y-4">
            {trendingPosts.map((post, i) => (
              <motion.div key={post.id} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 5) * 0.05 }}>
                <PostCard
                  post={post}
                  currentUserId={currentUser.id}
                  reactions={reactionsData[post.id]?.reactions || {}}
                  userReaction={reactionsData[post.id]?.userReaction || null}
                  comments={commentsData[post.id] || []}
                  onReactionToggle={() => {}}
                  onCommentAdded={() => {}}
                  onDelete={() => loadContent(currentUser.id)}
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

          <TabsContent value="trending" className="space-y-4">
            {trendingTopics.length > 0 && (
              <Card className="p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" /> Trending Topics
                </h3>
                <div className="flex flex-wrap gap-2">
                  {trendingTopics.map(t => (
                    <Badge key={t.tag} variant="secondary" className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors">
                      <Hash className="h-3 w-3 mr-1" /> {t.tag.replace("#", "")}
                      <span className="ml-1.5 text-[10px] opacity-70">{t.count}</span>
                    </Badge>
                  ))}
                </div>
              </Card>
            )}
            {trendingPosts.slice(0, 10).map((post, i) => (
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
                  comments={commentsData[post.id] || []}
                  onReactionToggle={() => {}}
                  onCommentAdded={() => {}}
                  onDelete={() => loadContent(currentUser.id)}
                />
              </motion.div>
            ))}
          </TabsContent>

          <TabsContent value="people" className="space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 text-accent" /> People you might know
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {suggestedUsers.map(user => (
                <Card key={user.id} className="p-4 text-center hover:shadow-md transition-shadow">
                  <Link to={`/profile/${user.id}`}>
                    <Avatar className="h-16 w-16 mx-auto mb-2">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-lg">{user.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                    </Avatar>
                    <p className="font-semibold text-sm line-clamp-1">{user.full_name || "User"}</p>
                    {user.bio && <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">{user.bio}</p>}
                  </Link>
                  <Button size="sm" variant="outline" className="mt-2 w-full text-xs h-7" onClick={() => {
                    supabase.from("friendships").insert({ user_id: currentUser.id, friend_id: user.id, status: "pending" }).then(() => {
                      setSuggestedUsers(prev => prev.filter(u => u.id !== user.id));
                    });
                  }}>
                    Add Friend
                  </Button>
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
      </div>
    </div>
  );
};

export default Explore;
