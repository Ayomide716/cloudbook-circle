import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import BottomNav from "@/components/BottomNav";
import GroupChat from "@/components/GroupChat";
import VoiceRooms from "@/components/VoiceRooms";
import EditGroupModal from "@/components/EditGroupModal";
import GroupVideoCall from "@/components/GroupVideoCall";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, UserPlus, Users, ArrowLeft, MessageCircle, Settings, Video, Phone, Radio } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import ImageUpload from "@/components/ImageUpload";

interface Group {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_by: string;
}

interface GroupPost {
  id: string;
  content: string;
  image_url: string | null;
  created_at: string;
  user_id: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface Member {
  id: string;
  role: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface GroupCallAlert {
  initiatorName: string;
  initiatorAvatar?: string | null;
  isVoiceOnly: boolean;
}

const GroupDetail = () => {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [posts, setPosts] = useState<GroupPost[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [postContent, setPostContent] = useState("");
  const [postImage, setPostImage] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [activeGroupCall, setActiveGroupCall] = useState<{ isVoiceOnly: boolean } | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);
  const [incomingGroupCall, setIncomingGroupCall] = useState<GroupCallAlert | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (currentUserId && groupId) {
      loadGroupData();
      setupRealtimeSubscription();
    }
  }, [currentUserId, groupId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setCurrentUserId(session.user.id);
    const { data: profile } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", session.user.id).single();
    if (profile) setCurrentUserProfile(profile);
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel(`group-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_posts",
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          loadPosts();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_members",
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          loadMembers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const loadGroupData = async () => {
    await Promise.all([
      loadGroup(),
      loadPosts(),
      loadMembers(),
      checkMembership(),
    ]);
    setIsLoading(false);
  };

  const loadGroup = async () => {
    const { data, error } = await supabase
      .from("groups")
      .select("*")
      .eq("id", groupId)
      .single();

    if (error) {
      toast({
        title: "Error loading group",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setGroup(data);
  };

  const loadPosts = async () => {
    const { data: postsData, error } = await supabase
      .from("group_posts")
      .select("*")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading posts:", error);
      return;
    }

    if (!postsData) {
      setPosts([]);
      return;
    }

    // Fetch profiles for each post
    const postsWithProfiles = await Promise.all(
      postsData.map(async (post) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .eq("id", post.user_id)
          .single();

        return {
          ...post,
          profiles: profile || { id: post.user_id, full_name: null, avatar_url: null },
        };
      })
    );

    setPosts(postsWithProfiles);
  };

  const loadMembers = async () => {
    const { data: membersData, error } = await supabase
      .from("group_members")
      .select("id, role, user_id")
      .eq("group_id", groupId);

    if (error) {
      console.error("Error loading members:", error);
      return;
    }

    if (!membersData) {
      setMembers([]);
      return;
    }

    // Fetch profiles for each member
    const membersWithProfiles = await Promise.all(
      membersData.map(async (member) => {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .eq("id", member.user_id)
          .single();

        return {
          id: member.id,
          role: member.role,
          profiles: profile || { id: member.user_id, full_name: null, avatar_url: null },
        };
      })
    );

    setMembers(membersWithProfiles);
  };

  const checkMembership = async () => {
    if (!currentUserId) return;

    const { data } = await supabase
      .from("group_members")
      .select("id, role")
      .eq("group_id", groupId)
      .eq("user_id", currentUserId)
      .maybeSingle();

    setIsMember(!!data);
    setUserRole(data?.role || null);
  };

  const handleJoinGroup = async () => {
    if (!currentUserId) return;

    const { error } = await supabase
      .from("group_members")
      .insert({
        group_id: groupId,
        user_id: currentUserId,
        role: "member",
      });

    if (error) {
      toast({
        title: "Error joining group",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Joined group successfully",
    });
    setIsMember(true);
    loadMembers();
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!postContent.trim() && !postImage) return;

    setIsPosting(true);

    const { error } = await supabase
      .from("group_posts")
      .insert({
        group_id: groupId,
        user_id: currentUserId,
        content: postContent.trim(),
        image_url: postImage || null,
      });

    setIsPosting(false);

    if (error) {
      toast({
        title: "Error creating post",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setPostContent("");
    setPostImage("");
    toast({
      title: "Post created successfully",
    });
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

  if (!group) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <div className="container mx-auto px-4 py-6 text-center">
          <p className="text-muted-foreground">Group not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId || undefined} />
      
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/groups")}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Groups
        </Button>

        <Card className="p-6 mb-6">
          {group.image_url && (
            <img
              src={group.image_url}
              alt={group.name}
              className="w-full h-48 object-cover rounded-lg mb-4"
            />
          )}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">{group.name}</h1>
              {group.description && (
                <p className="text-muted-foreground mb-4">{group.description}</p>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-5 w-5" />
                <span>{members.length} members</span>
              </div>
            </div>
            <div className="flex gap-2">
              {isMember && (
                <>
                  <Button variant="outline" size="icon" onClick={() => setActiveGroupCall({ isVoiceOnly: true })} title="Group Voice Call">
                    <Phone className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => setActiveGroupCall({ isVoiceOnly: false })} title="Group Video Call">
                    <Video className="h-4 w-4" />
                  </Button>
                </>
              )}
              {(userRole === "admin" || group.created_by === currentUserId) && (
                <Button variant="outline" size="icon" onClick={() => setShowEditModal(true)}>
                  <Settings className="h-4 w-4" />
                </Button>
              )}
              {!isMember && (
                <Button onClick={handleJoinGroup}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Join Group
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Edit Group Modal */}
        {group && (
          <EditGroupModal
            group={group}
            open={showEditModal}
            onOpenChange={setShowEditModal}
            onGroupUpdated={loadGroup}
          />
        )}

        <Tabs defaultValue="chat" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="chat" className="flex items-center gap-1">
              <MessageCircle className="h-4 w-4" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="voice" className="flex items-center gap-1">
              <Radio className="h-4 w-4" />
              Voice
            </TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
          </TabsList>

          <TabsContent value="chat">
            {isMember ? (
              <GroupChat groupId={groupId!} currentUserId={currentUserId!} />
            ) : (
              <Card className="p-12 text-center">
                <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Join the group to participate in the chat
                </p>
                <Button onClick={handleJoinGroup} className="mt-4">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Join Group
                </Button>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="voice">
            {isMember && currentUserId ? (
              <VoiceRooms groupId={groupId!} currentUserId={currentUserId} />
            ) : (
              <Card className="p-12 text-center">
                <Radio className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Join the group to access voice rooms</p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="posts" className="space-y-4">
            {isMember && (
              <Card className="p-4">
                <form onSubmit={handleCreatePost} className="space-y-4">
                  <Textarea
                    placeholder="Share something with the group..."
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    className="min-h-[100px]"
                    disabled={isPosting}
                  />
                  
                  <ImageUpload
                    bucket="post-images"
                    userId={currentUserId!}
                    onUploadComplete={setPostImage}
                    currentImage={postImage}
                    label="Add Photo"
                  />

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={isPosting || (!postContent.trim() && !postImage)}
                    >
                      {isPosting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Posting...
                        </>
                      ) : (
                        "Post"
                      )}
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            {posts.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">No posts yet</p>
                {isMember && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Be the first to share something!
                  </p>
                )}
              </Card>
            ) : (
              posts.map((post) => (
                <Card key={post.id} className="p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <Avatar>
                      <AvatarImage src={post.profiles.avatar_url || undefined} />
                      <AvatarFallback>
                        {post.profiles.full_name?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">
                        {post.profiles.full_name || "Anonymous"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(post.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>

                  <p className="mb-3 whitespace-pre-wrap">{post.content}</p>

                  {post.image_url && (
                    <img
                      src={post.image_url}
                      alt="Post content"
                      className="w-full rounded-lg max-h-96 object-cover"
                    />
                  )}
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="members" className="space-y-4">
            {members.map((member) => (
              <Card key={member.id} className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={member.profiles.avatar_url || undefined} />
                    <AvatarFallback>
                      {member.profiles.full_name?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold">
                      {member.profiles.full_name || "Anonymous"}
                    </p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {member.role}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav currentUserId={currentUserId || undefined} />

      {/* Group Video Call */}
      {activeGroupCall && currentUserId && group && (
        <GroupVideoCall
          groupId={group.id}
          groupName={group.name}
          currentUserId={currentUserId}
          currentUserName={currentUserProfile?.full_name || "You"}
          currentUserAvatar={currentUserProfile?.avatar_url}
          isVoiceOnly={activeGroupCall.isVoiceOnly}
          onEnd={() => setActiveGroupCall(null)}
        />
      )}
    </div>
  );
};

export default GroupDetail;
