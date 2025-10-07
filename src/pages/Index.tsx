import { useEffect, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import CreatePost from "@/components/CreatePost";
import PostCard from "@/components/PostCard";
import FeedFilter from "@/components/FeedFilter";
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
  created_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedFilter, setFeedFilter] = useState<'all' | 'friends'>('all');
  const [likesData, setLikesData] = useState<Record<string, { count: number; isLiked: boolean }>>({});
  const [commentsData, setCommentsData] = useState<Record<string, any[]>>({});

  useEffect(() => {
    checkAuth();
    setupRealtimeSubscription();
  }, [navigate]);

  useEffect(() => {
    if (currentUser) {
      loadPosts(currentUser.id);
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
      loadPosts(session.user.id);
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
              loadPosts(data.session.user.id);
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const loadPosts = async (userId: string) => {
    setIsLoading(true);

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

    setPosts(postsData || []);
    
    const postIds = postsData?.map(p => p.id) || [];

    const { data: likesData } = await supabase
      .from("likes")
      .select("post_id, user_id")
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

    const likesMap: Record<string, { count: number; isLiked: boolean }> = {};
    postIds.forEach(id => {
      const postLikes = likesData?.filter(l => l.post_id === id) || [];
      likesMap[id] = {
        count: postLikes.length,
        isLiked: postLikes.some(l => l.user_id === userId),
      };
    });

    const commentsMap: Record<string, any[]> = {};
    postIds.forEach(id => {
      commentsMap[id] = commentsData?.filter(c => c.post_id === id) || [];
    });

    setLikesData(likesMap);
    setCommentsData(commentsMap);
    setIsLoading(false);
  };

  const handleLikeToggle = async (postId: string) => {
    if (!currentUser) return;
    
    // Optimistically update UI
    setLikesData(prev => ({
      ...prev,
      [postId]: {
        count: prev[postId].isLiked ? prev[postId].count - 1 : prev[postId].count + 1,
        isLiked: !prev[postId].isLiked
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
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUser.id} />
      
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="space-y-4">
          <Suspense fallback={<div className="h-24" />}>
            <StoriesBar currentUserId={currentUser.id} />
          </Suspense>
          
          <CreatePost
            currentUser={currentUser}
            onPostCreated={() => loadPosts(currentUser.id)}
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
                likesCount={likesData[post.id]?.count || 0}
                isLiked={likesData[post.id]?.isLiked || false}
                comments={commentsData[post.id] || []}
                onLikeToggle={() => handleLikeToggle(post.id)}
                onCommentAdded={() => handleCommentAdded(post.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
