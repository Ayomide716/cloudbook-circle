import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import PostCard from "@/components/PostCard";
import FriendshipButton from "@/components/FriendshipButton";
import EditProfileModal from "@/components/EditProfileModal";
import OnlineStatusIndicator from "@/components/OnlineStatusIndicator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Edit, MessageCircle, MapPin, Briefcase, GraduationCap, Link as LinkIcon } from "lucide-react";
import ImageUpload from "@/components/ImageUpload";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  work: string | null;
  education: string | null;
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
  const [reactionsData, setReactionsData] = useState<Record<string, { reactions: Record<string, number>; userReaction: string | null }>>({});
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

    if (profileData) {
      setProfile(profileData as any);
    }

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
      const userReaction = postReactions.find(r => r.user_id === currentUserId);
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

  const handleCoverUpload = async (url: string) => {
    if (!profile) return;

    const { error } = await supabase
      .from("profiles")
      .update({ cover_url: url } as any)
      .eq("id", profile.id);

    if (error) {
      toast({
        title: "Error updating cover photo",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setProfile({ ...profile, cover_url: url });
    toast({
      title: "Cover photo updated successfully",
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
      
      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 max-w-4xl">
        {/* Cover Photo */}
        <Card className="mb-4 sm:mb-6 overflow-hidden">
          <div className="relative h-40 sm:h-64 bg-gradient-to-r from-primary to-accent">
            {profile.cover_url && (
              <img
                src={profile.cover_url}
                alt="Cover"
                className="w-full h-full object-cover"
              />
            )}
            {currentUserId === userId && (
              <div className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4">
                <ImageUpload
                  bucket="avatars"
                  userId={currentUserId}
                  onUploadComplete={handleCoverUpload}
                  currentImage={profile.cover_url || undefined}
                  label="Edit Cover Photo"
                />
              </div>
            )}
          </div>
          
          <div className="p-3 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 -mt-16 sm:-mt-20">
              <div className="relative flex flex-col items-center sm:items-start">
                <Avatar className="h-24 w-24 sm:h-32 sm:w-32 border-4 border-background">
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback className="text-2xl sm:text-4xl">
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
                <div className="absolute -bottom-1 -right-1">
                  <OnlineStatusIndicator userId={userId || ""} />
                </div>
              </div>
              
              <div className="flex-1 mt-2 sm:mt-16 w-full">
                <div className="flex flex-col sm:flex-row items-start justify-between gap-3 mb-2">
                  <div className="w-full sm:w-auto">
                    <h1 className="text-2xl sm:text-3xl font-bold text-center sm:text-left">
                      {profile.full_name || "Anonymous User"}
                    </h1>
                    <div className="flex justify-center sm:justify-start">
                      <OnlineStatusIndicator userId={userId || ""} showText />
                    </div>
                  </div>
                  {currentUserId === userId ? (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setIsEditingProfile(!isEditingProfile)}
                      className="w-full sm:w-auto"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Profile
                    </Button>
                  ) : (
                    <div className="flex gap-2 w-full sm:w-auto">
                      <FriendshipButton
                        currentUserId={currentUserId || ""}
                        profileUserId={userId || ""}
                      />
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={startMessage}
                        className="flex-1 sm:flex-none"
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
                
                <div className="space-y-2 text-sm text-muted-foreground">
                  {profile.work && (
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      <span>{profile.work}</span>
                    </div>
                  )}
                  {profile.education && (
                    <div className="flex items-center gap-2">
                      <GraduationCap className="h-4 w-4" />
                      <span>{profile.education}</span>
                    </div>
                  )}
                  {profile.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span>{profile.location}</span>
                    </div>
                  )}
                  {profile.website && (
                    <div className="flex items-center gap-2">
                      <LinkIcon className="h-4 w-4" />
                      <a 
                        href={profile.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline text-primary"
                      >
                        {profile.website}
                      </a>
                    </div>
                  )}
                </div>
                
                <div className="flex gap-6 text-sm mt-4">
                  <div>
                    <span className="font-semibold">{posts.length}</span>{" "}
                    <span className="text-muted-foreground">posts</span>
                  </div>
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
                reactions={reactionsData[post.id]?.reactions || {}}
                userReaction={reactionsData[post.id]?.userReaction || null}
                comments={commentsData[post.id] || []}
                onReactionToggle={() => loadProfile()}
                onCommentAdded={() => loadProfile()}
                onDelete={() => loadProfile()}
              />
            ))
          )}
        </div>
      </div>

      {/* Edit Profile Modal */}
      {profile && (
        <EditProfileModal
          profile={profile}
          isOpen={isEditingProfile}
          onClose={() => setIsEditingProfile(false)}
          onUpdate={loadProfile}
        />
      )}
    </div>
  );
};

export default Profile;