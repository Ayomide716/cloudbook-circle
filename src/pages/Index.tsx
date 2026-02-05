import { useEffect, useState, lazy, Suspense, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import CreatePost from "@/components/CreatePost";
import PostCard from "@/components/PostCard";
import FeedFilter from "@/components/FeedFilter";
import PullToRefresh from "@/components/PullToRefresh";
import { Loader2 } from "lucide-react";

const StoriesBar = lazy(() => import("@/components/StoriesBar"));

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Post {
  id: string;
  content: string;
  image_url: string | null;
  video_url?: string | null;
  created_at: string;
  user_id: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
   poll?: {
     id: string;
     question: string;
     options: string[];
   } | null;
}

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedFilter, setFeedFilter] = useState<'all' | 'friends'>('all');
  const [reactionsData, setReactionsData] = useState<Record<string, { reactions: Record<string, number>; userReaction: string | null }>>({});
  const [commentsData, setCommentsData] = useState<Record<string, any[]>>({});

  useEffect(() => {
    checkAuth();
    setupRealtimeSubscription();
  }, [navigate]);

  useEffect(() => {
    if (currentUser) {
      loadPosts(currentUser.id, false);
    }
  }, [feedFilter]);

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

    if (profile) {
      setCurrentUser(profile);
      loadPosts(session.user.id, true);
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel("posts-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "posts",
        },
        () => {
          const session = supabase.auth.getSession();
          session.then(({ data }) => {
            if (data.session) {
              loadPosts(data.session.user.id, false);
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const loadPosts = async (userId: string, showLoader = false) => {
    if (showLoader) {
      setIsLoading(true);
    }

    let query = supabase
      .from("posts")
      .select(`
        *,
        profiles:user_id (
          id,
          full_name,
          avatar_url
        )
      `);

    if (feedFilter === 'friends') {
      const { data: friendships } = await supabase
        .from("friendships")
        .select("user_id, friend_id")
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
        .eq("status", "accepted");

      const friendIds = friendships?.map(f => 
        f.user_id === userId ? f.friend_id : f.user_id
      ) || [];

      if (friendIds.length > 0) {
        query = query.in("user_id", [...friendIds, userId]);
      } else {
        query = query.eq("user_id", userId);
      }
    }

    const { data: postsData, error } = await query.order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error loading posts",
        description: error.message,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    const postIds = postsData?.map(p => p.id) || [];

     // Load polls for posts
     const { data: pollsData } = await supabase
       .from("polls")
       .select("id, post_id, question, options")
       .in("post_id", postIds);
 
     // Merge polls into posts
     const postsWithPolls = (postsData || []).map(post => {
       const poll = pollsData?.find(p => p.post_id === post.id);
       return {
         ...post,
         poll: poll ? {
           id: poll.id,
           question: poll.question,
           options: poll.options as string[]
         } : null
       };
     });
 
     setPosts(postsWithPolls);
 
    const { data: reactionsData } = await supabase
      .from("reactions")
      .select("post_id, user_id, reaction_type")
      .in("post_id", postIds);

    const { data: commentsData } = await supabase
      .from("comments")
      .select(`
        *,
        profiles:user_id (
          id,
          full_name,
          avatar_url
        )
      `)
      .in("post_id", postIds)
      .order("created_at", { ascending: true });

    const reactionsMap: Record<string, { reactions: Record<string, number>; userReaction: string | null }> = {};
    postIds.forEach(id => {
      const postReactions = reactionsData?.filter(r => r.post_id === id) || [];
      const reactionCounts: Record<string, number> = {};
      postReactions.forEach(r => {
        reactionCounts[r.reaction_type] = (reactionCounts[r.reaction_type] || 0) + 1;
      });
      const userReaction = postReactions.find(r => r.user_id === userId);
      reactionsMap[id] = {
        reactions: reactionCounts,
        userReaction: userReaction?.reaction_type || null
      };
    });

    const commentsMap: Record<string, any[]> = {};
    postIds.forEach(id => {
      commentsMap[id] = commentsData?.filter(c => c.post_id === id) || [];
    });

    setReactionsData(reactionsMap);
    setCommentsData(commentsMap);
    setIsLoading(false);
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
    
    // Optimistically update UI
    setReactionsData(prev => ({
      ...prev,
      [postId]: {
        reactions: currentReactions,
        userReaction: wasReaction === reactionType ? null : reactionType
      }
    }));
  };

  const handleCommentAdded = async (postId: string) => {
    if (!currentUser) return;
    
    // Reload comments for this specific post
    const { data: commentsData } = await supabase
      .from("comments")
      .select(`
        *,
        profiles:user_id (
          id,
          full_name,
          avatar_url
        )
      `)
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    setCommentsData(prev => ({
      ...prev,
      [postId]: commentsData || []
    }));
  };

  const handleRefresh = useCallback(async () => {
    if (currentUser) {
      await loadPosts(currentUser.id, false);
    }
  }, [currentUser]);

  if (isLoading || !currentUser) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="flex items-center justify-center h-[calc(100vh-56px)]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation currentUserId={currentUser.id} />
      
      <PullToRefresh onRefresh={handleRefresh} className="flex-1 pb-safe">
        <div className="max-w-[1400px] mx-auto px-2 sm:px-4 lg:px-6 py-4 sm:py-6">
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] xl:grid-cols-[320px_1fr_320px] gap-6">
            {/* Left Sidebar - Hidden on mobile */}
            <aside className="hidden lg:block space-y-4">
              <div className="sticky top-20 space-y-4">
                <div className="bg-card rounded-xl p-4 border border-border">
                  <div className="flex items-center gap-3 mb-4">
                    <img 
                      src={currentUser.avatar_url || "/placeholder.svg"} 
                      alt="" 
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div>
                      <p className="font-semibold">{currentUser.full_name}</p>
                      <p className="text-xs text-muted-foreground">View your profile</p>
                    </div>
                  </div>
                </div>
                <div className="bg-card rounded-xl p-4 border border-border">
                  <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">Quick Links</h3>
                  <nav className="space-y-1">
                    <a href="/friends" className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors">
                      <span className="text-lg">👥</span>
                      <span className="text-sm font-medium">Friends</span>
                    </a>
                    <a href="/groups" className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors">
                      <span className="text-lg">👨‍👩‍👧‍👦</span>
                      <span className="text-sm font-medium">Groups</span>
                    </a>
                    <a href="/messages" className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors">
                      <span className="text-lg">💬</span>
                      <span className="text-sm font-medium">Messages</span>
                    </a>
                    <a href="/reels" className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors">
                      <span className="text-lg">🎬</span>
                      <span className="text-sm font-medium">Reels</span>
                    </a>
                     <a href="/events" className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors">
                       <span className="text-lg">📅</span>
                       <span className="text-sm font-medium">Events</span>
                     </a>
                     <a href="/saved" className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors">
                       <span className="text-lg">🔖</span>
                       <span className="text-sm font-medium">Saved</span>
                     </a>
                  </nav>
                </div>
              </div>
            </aside>

            {/* Main Feed */}
            <main className="space-y-4 min-w-0">
              <Suspense fallback={<div className="h-24" />}>
                <StoriesBar currentUserId={currentUser.id} />
              </Suspense>
              
              <CreatePost
                currentUser={currentUser}
                onPostCreated={() => loadPosts(currentUser.id, false)}
              />

              <FeedFilter
                filter={feedFilter}
                onFilterChange={setFeedFilter}
              />

              {posts.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No posts yet. Be the first to post!</p>
                </div>
              ) : (
                posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUser.id}
                    reactions={reactionsData[post.id]?.reactions || {}}
                    userReaction={reactionsData[post.id]?.userReaction || null}
                    comments={commentsData[post.id] || []}
                    onReactionToggle={(type) => handleReactionToggle(post.id, type)}
                    onCommentAdded={() => handleCommentAdded(post.id)}
                    onDelete={() => loadPosts(currentUser.id, false)}
                  />
                ))
              )}
            </main>

            {/* Right Sidebar - Hidden on mobile */}
            <aside className="hidden lg:block">
              <div className="sticky top-20 space-y-4">
                <div className="bg-card rounded-xl p-4 border border-border">
                  <h3 className="font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wide">Contacts</h3>
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
