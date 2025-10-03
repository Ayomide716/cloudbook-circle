import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import PostCard from "@/components/PostCard";
import FriendshipButton from "@/components/FriendshipButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Edit, MessageCircle } from "lucide-react";
import ImageUpload from "@/components/ImageUpload";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
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

const Profile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [likesData, setLikesData] = useState<Record<string, { count: number; isLiked: boolean }>>({});
  const [commentsData, setCommentsData] = useState<Record<string, any[]>>({});

  useEffect(() => {
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (userId) {
      loadProfile();
    }
  }, [userId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setCurrentUserId(session.user.id);
  };

  const loadProfile = async () => {
    setIsLoading(true);

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError) {
      toast({
        title: "Error loading profile",
        description: profileError.message,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    setProfile(profileData);

    const { data: postsData, error: postsError } = await supabase
      .from("posts")
      .select(`
        *,
        profiles:user_id (
          id,
          full_name,
          avatar_url
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (postsError) {
      toast({
        title: "Error loading posts",
        description: postsError.message,
        variant: "destructive",
      });
    } else {
      setPosts(postsData || []);
      loadPostsData(postsData || []);
    }

    setIsLoading(false);
  };

  const loadPostsData = async (postsData: Post[]) => {
    if (!currentUserId) return;

    const postIds = postsData.map(p => p.id);

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
        isLiked: postLikes.some(l => l.user_id === currentUserId),
      };
    });

    const commentsMap: Record<string, any[]> = {};
    postIds.forEach(id => {
      commentsMap[id] = commentsData?.filter(c => c.post_id === id) || [];
    });

    setLikesData(likesMap);
    setCommentsData(commentsMap);
  };

  const handleAvatarUpload = async (url: string) => {
    if (!profile) return;

    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", profile.id);

    if (error) {
      toast({
        title: "Error updating avatar",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setProfile({ ...profile, avatar_url: url });
    toast({
      title: "Avatar updated successfully",
    });
  };

  const startMessage = () => {
    if (!userId) return;
    navigate("/messages", { state: { selectedUserId: userId } });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <div className="flex items-center justify-center h-[calc(100vh-56px)]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <div className="container mx-auto px-4 py-8">
          <p className="text-center text-muted-foreground">Profile not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId || undefined} />
      
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="p-6 mb-6">
          <div className="flex items-start gap-6">
            <div className="relative">
              <Avatar className="h-32 w-32">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="text-4xl">
                  {profile.full_name?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              {currentUserId === userId && (
                <div className="mt-2">
                  <ImageUpload
                    bucket="avatars"
                    userId={currentUserId}
                    onUploadComplete={handleAvatarUpload}
                    currentImage={profile.avatar_url || undefined}
                    label="Change Avatar"
                  />
                </div>
              )}
            </div>
            
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <h1 className="text-3xl font-bold">
                  {profile.full_name || "Anonymous User"}
                </h1>
                {currentUserId === userId ? (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setIsEditingProfile(!isEditingProfile)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Profile
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <FriendshipButton
                      currentUserId={currentUserId || ""}
                      profileUserId={userId || ""}
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={startMessage}
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Message
                    </Button>
                  </div>
                )}
              </div>
              
              {profile.bio && (
                <p className="text-muted-foreground mb-4">{profile.bio}</p>
              )}
              
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="font-semibold">{posts.length}</span>{" "}
                  <span className="text-muted-foreground">posts</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Posts</h2>
          {posts.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">No posts yet</p>
            </Card>
          ) : (
            posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={currentUserId || ""}
                likesCount={likesData[post.id]?.count || 0}
                isLiked={likesData[post.id]?.isLiked || false}
                comments={commentsData[post.id] || []}
                onLikeToggle={() => loadProfile()}
                onCommentAdded={() => loadProfile()}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Profile;