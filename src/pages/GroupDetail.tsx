import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import VoiceRooms from "@/components/VoiceRooms";
import EditGroupModal from "@/components/EditGroupModal";
import { useCalls } from "@/hooks/use-calls";
import { useGroupCallParticipants } from "@/hooks/use-group-call-participants";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, UserPlus, Users, ArrowLeft, MessageCircle, Settings, Video, Phone, Radio, Trash2, Check, Globe, MoreHorizontal, ShieldCheck, ShieldOff, UserMinus } from "lucide-react";
import { HeaderAction } from "@/components/layout/PageHeader";
import { formatDistanceToNow } from "date-fns";
import ImageUpload from "@/components/ImageUpload";
import { useEffectEvent } from "@/hooks/use-effect-event";
import ConfirmDialog from "@/components/ConfirmDialog";
import GroupConversation from "@/components/groups/GroupConversation";
import AddGroupMembersDialog from "@/components/AddGroupMembersDialog";
import { ActionMenu, ActionMenuContent, ActionMenuItem, ActionMenuTrigger } from "@/components/ui/action-menu";
import { dbChannel } from "@/lib/realtime";
import { Skeleton } from "@/components/ui/skeleton";
import { RowSkeleton } from "@/components/skeletons/parts";

interface Group {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_by: string;
  created_at?: string;
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
  // Non-members can't see the member list, so the count comes from the server.
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "leave" } | { kind: "post"; id: string } | { kind: "remove"; member: Member } | null>(null);
  const [showAddPeople, setShowAddPeople] = useState(false);
  const isAdmin = userRole === "admin";
  const { startGroupCall: startCall, joinGroupCall, activeGroupId } = useCalls();
  const inThisCall = !!groupId && activeGroupId === groupId;
  // Who's in this group's call right now (only watched while you're a member and not in it).
  const callParticipants = useGroupCallParticipants(groupId, isMember && !inThisCall);

  const checkAuth = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setCurrentUserId(session.user.id);
  });

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const setupRealtimeSubscription = useEffectEvent(() => {
    const channel = dbChannel(`group-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_posts", filter: `group_id=eq.${groupId}` },
        () => { loadPosts(); }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_members", filter: `group_id=eq.${groupId}` },
        () => { loadMembers(); checkMembership(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  });

  const startGroupCall = (isVoiceOnly: boolean) => {
    if (!group) return;
    startCall({ id: group.id, name: group.name }, isVoiceOnly, members.map((m) => m.profiles.id));
  };

  const loadGroupData = useEffectEvent(async () => {
    await Promise.all([
      loadGroup(),
      loadPosts(),
      loadMembers(),
      checkMembership(),
      loadMemberCount(),
    ]);
    setIsLoading(false);
  });

  useEffect(() => {
    if (currentUserId && groupId) {
      loadGroupData();
      return setupRealtimeSubscription();
    }
  }, [currentUserId, groupId, loadGroupData, setupRealtimeSubscription]);

  const loadGroup = async () => {
    if (!groupId) return;
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

  // One query for every author or member instead of one each.
  const fetchProfiles = async (ids: string[]) => {
    const unique = [...new Set(ids)];
    const map = new Map<string, Member["profiles"]>();
    if (!unique.length) return map;
    const { data } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", unique);
    for (const p of data || []) map.set(p.id, p);
    return map;
  };

  const loadMemberCount = async () => {
    if (!groupId) return;
    const { data, error } = await supabase.rpc("group_member_counts", { _group_ids: [groupId] });
    if (!error) setMemberCount(Number(data?.[0]?.member_count ?? 0));
  };

  const loadPosts = async () => {
    if (!groupId) return;
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

    const profiles = await fetchProfiles(postsData.map((p) => p.user_id));
    const postsWithProfiles = postsData.map((post) => ({
      ...post,
      profiles: profiles.get(post.user_id) || { id: post.user_id, full_name: null, avatar_url: null },
    }));

    setPosts(postsWithProfiles);
  };

  const managementError = (error: { message: string }) =>
    /Could not find the function|function .*group_member/i.test(error.message)
      ? "Managing members needs the latest database update."
      : error.message;

  const removeMember = async (member: Member) => {
    if (!groupId) return;
    const { error } = await supabase.rpc("remove_group_member", { _group: groupId, _user: member.profiles.id });
    if (error) {
      toast({ title: "Couldn't remove them", description: managementError(error), variant: "destructive" });
      return;
    }
    toast({ title: `${member.profiles.full_name || "They"} ${member.profiles.full_name ? "was" : "were"} removed from the group` });
    loadMembers();
  };

  const changeRole = async (member: Member, role: "admin" | "member") => {
    if (!groupId) return;
    const { error } = await supabase.rpc("set_group_member_role", { _group: groupId, _user: member.profiles.id, _role: role });
    if (error) {
      toast({ title: "Couldn't change their role", description: managementError(error), variant: "destructive" });
      return;
    }
    toast({ title: role === "admin" ? `${member.profiles.full_name || "They"} can now manage the group` : `${member.profiles.full_name || "They"} is no longer an admin` });
    loadMembers();
  };

  const loadMembers = async () => {
    if (!groupId) return;
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

    const profiles = await fetchProfiles(membersData.map((m) => m.user_id));
    const membersWithProfiles = membersData
      .map((member) => ({
        id: member.id,
        role: member.role,
        profiles: profiles.get(member.user_id) || { id: member.user_id, full_name: null, avatar_url: null },
      }))
      // Admins first, then by name.
      .sort((a, b) =>
        (a.role === "admin" ? 0 : 1) - (b.role === "admin" ? 0 : 1) ||
        (a.profiles.full_name || "").localeCompare(b.profiles.full_name || "")
      );

    setMembers(membersWithProfiles);
    loadMemberCount();
  };

  const checkMembership = async () => {
    if (!currentUserId || !groupId) return;

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
    if (!currentUserId || !groupId || isJoining) return;
    setIsJoining(true);

    const { error } = await supabase
      .from("group_members")
      .insert({
        group_id: groupId,
        user_id: currentUserId,
        role: "member",
      });

    setIsJoining(false);
    if (error) {
      toast({
        title: "Error joining group",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    await checkMembership();
    loadMembers();
    loadPosts();
  };

  const handleLeaveGroup = async () => {
    if (!currentUserId || !groupId) return;
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", currentUserId);

    if (error) {
      toast({ title: "Couldn't leave the group", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `You left ${group?.name ?? "the group"}` });
    setIsMember(false);
    setUserRole(null);
    // Members-only content is no longer visible.
    setMembers([]);
    setPosts([]);
    loadMemberCount();
  };

  const handleDeletePost = async (postId: string) => {
    const { error } = await supabase.from("group_posts").delete().eq("id", postId);
    if (error) {
      toast({ title: "Couldn't delete post", description: error.message, variant: "destructive" });
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUserId || !groupId) return;
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
    // Don't wait on realtime to show your own post.
    loadPosts();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        {/* The group's shape in grey while it loads, instead of a spinner. */}
        <div className="mx-auto max-w-2xl" aria-busy="true">
          <Skeleton className="h-40 w-full rounded-none sm:h-56 sm:rounded-2xl" />
          <div className="space-y-2 px-4 py-4">
            <Skeleton className="h-7 w-2/3 rounded-full" />
            <Skeleton className="h-4 w-1/3 rounded-full" />
          </div>
          {[0, 1, 2].map((r) => <RowSkeleton key={r} />)}
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <div className="container mx-auto px-4 py-12 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-lg font-semibold mb-1">Group not found</p>
          <p className="text-muted-foreground mb-4">It may have been deleted, or the link is wrong.</p>
          <Button variant="outline" onClick={() => navigate("/groups")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Groups
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId || undefined} />
      
      <div className="page-flush mx-auto max-w-4xl px-0 sm:px-4 pb-6 sm:py-6">
        {/* Group header, Facebook style: cover, name, members, actions */}
        <section className="feed-section mb-2 sm:mb-5 overflow-hidden rounded-2xl border border-border bg-card">
          <div className="relative">
            {group.image_url ? (
              <img src={group.image_url} alt="" className="h-40 w-full object-cover sm:h-56" />
            ) : (
              <div className="h-24 w-full gradient-brand opacity-80 sm:h-32" />
            )}
            <button
              type="button"
              onClick={() => navigate("/groups")}
              className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
              aria-label="Back to groups"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-3 p-4 sm:p-5">
            <div>
              <h1 className="font-display text-2xl font-bold leading-tight sm:text-3xl [overflow-wrap:anywhere]">{group.name}</h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Globe className="h-4 w-4" />
                Public group
                {(() => {
                  const n = isMember ? members.length : memberCount;
                  return n === null ? null : <> · <strong className="font-semibold text-foreground">{n}</strong> {n === 1 ? "member" : "members"}</>;
                })()}
              </p>
            </div>

            {isMember && members.length > 0 && (
              <div className="flex -space-x-2" aria-hidden="true">
                {members.slice(0, 8).map((m) => (
                  <Avatar key={m.id} className="h-8 w-8 ring-2 ring-card">
                    <AvatarImage src={m.profiles.avatar_url || undefined} alt="" />
                    <AvatarFallback className="text-[10px]">{m.profiles.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                ))}
              </div>
            )}

            {group.description && (
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{group.description}</p>
            )}

            <div className="flex items-center gap-2">
              {isMember ? (
                <>
                  <Button variant="secondary" className="flex-1 sm:flex-none rounded-xl" onClick={() => setConfirm({ kind: "leave" })} aria-label="Joined. Leave group?">
                    <Check className="mr-2 h-4 w-4" /> Joined
                  </Button>
                  <Button className="flex-1 sm:flex-none rounded-xl" onClick={() => setShowAddPeople(true)}>
                    <UserPlus className="mr-2 h-4 w-4" /> Add people
                  </Button>
                </>
              ) : (
                <Button className="flex-1 sm:flex-none rounded-xl" onClick={handleJoinGroup} disabled={isJoining}>
                  {isJoining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  Join group
                </Button>
              )}
              {isMember && (
                <>
                  <HeaderAction icon={Phone} label="Start group voice call" onClick={() => startGroupCall(true)} />
                  <HeaderAction icon={Video} label="Start group video call" onClick={() => startGroupCall(false)} />
                </>
              )}
              {(userRole === "admin" || group.created_by === currentUserId) && (
                <HeaderAction icon={Settings} label="Group settings" onClick={() => setShowEditModal(true)} />
              )}
            </div>
          </div>
        </section>

        {/* A call is running in this group: offer to join it */}
        {callParticipants.length > 0 && group && (
          <Card className="feed-section p-3 sm:p-4 mb-2 sm:mb-4 border-primary/40 bg-primary/5">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2 shrink-0">
                {callParticipants.slice(0, 3).map((p) => (
                  <Avatar key={p.userId} className="h-9 w-9 ring-2 ring-background">
                    <AvatarImage src={p.avatar || undefined} alt="" />
                    <AvatarFallback className="text-xs">{p.name?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  {callParticipants.some((p) => p.video) ? "Video" : "Voice"} call in progress
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {callParticipants.map((p) => p.name).join(", ")}
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => joinGroupCall({ id: group.id, name: group.name }, !callParticipants.some((p) => p.video))}
                className="gradient-brand text-primary-foreground rounded-full px-4 shrink-0"
              >
                Join
              </Button>
            </div>
          </Card>
        )}

        {/* Edit Group Modal */}
        {group && (
          <EditGroupModal
            group={group}
            open={showEditModal}
            onOpenChange={setShowEditModal}
            onGroupUpdated={loadGroup}
          />
        )}

        <Tabs defaultValue="chat" className="space-y-2 sm:space-y-4">
          <TabsList className="feed-section grid w-full grid-cols-4 bg-card sm:bg-transparent">
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
              // The community's own chat, in the same style as Messages (it doesn't go in your chat list).
              <div className="feed-section h-[calc(100dvh-22rem)] min-h-[420px] overflow-hidden rounded-[1.125rem] border bg-card">
                <GroupConversation
                  embedded
                  group={{ ...group, created_at: group.created_at ?? new Date().toISOString() }}
                  currentUserId={currentUserId!}
                  onBack={() => {}}
                  onSeen={() => {}}
                  onLeft={() => {}}
                />
              </div>
            ) : (
              <Card className="feed-section p-12 text-center">
                <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Join the group to participate in the chat
                </p>
                <Button onClick={handleJoinGroup} className="mt-4" disabled={isJoining}>
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
              <Card className="feed-section p-12 text-center">
                <Radio className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Join the group to access voice rooms</p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="posts" className="space-y-4">
            {isMember && (
              <Card className="feed-section p-4">
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

            {!isMember ? (
              <Card className="feed-section p-12 text-center">
                <p className="text-muted-foreground">Join the group to see and share posts</p>
              </Card>
            ) : posts.length === 0 ? (
              <Card className="feed-section p-12 text-center">
                <p className="text-muted-foreground">No posts yet</p>
                {isMember && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Be the first to share something!
                  </p>
                )}
              </Card>
            ) : (
              posts.map((post) => (
                <Card key={post.id} className="feed-section p-4">
                  <div className="flex items-start gap-3 mb-3">
                    <Avatar className="cursor-pointer" onClick={() => navigate(`/profile/${post.user_id}`)}>
                      <AvatarImage src={post.profiles.avatar_url || undefined} alt="" />
                      <AvatarFallback>
                        {post.profiles.full_name?.[0]?.toUpperCase() || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        className="font-semibold hover:underline text-left truncate max-w-full"
                        onClick={() => navigate(`/profile/${post.user_id}`)}
                      >
                        {post.profiles.full_name || "Anonymous"}
                      </button>
                      <p className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(post.created_at), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                    {post.user_id === currentUserId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground"
                        onClick={() => setConfirm({ kind: "post", id: post.id })}
                        aria-label="Delete post"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {post.content && <p className="mb-3 whitespace-pre-wrap break-words">{post.content}</p>}

                  {post.image_url && (
                    <img
                      src={post.image_url}
                      alt=""
                      loading="lazy"
                      className="w-full rounded-lg max-h-96 object-cover"
                    />
                  )}
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="members" className="space-y-4">
            {!isMember && (
              <Card className="feed-section p-12 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Join the group to see who's in it</p>
              </Card>
            )}
            {isMember && (
              <Button variant="secondary" className="w-full rounded-xl" onClick={() => setShowAddPeople(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> Add people
              </Button>
            )}
            {members.map((member) => (
              <Card key={member.id} className="feed-section p-0 overflow-hidden flex items-center">
                <button
                  type="button"
                  onClick={() => navigate(`/profile/${member.profiles.id}`)}
                  className="min-w-0 flex-1 p-4 flex items-center gap-3 text-left hover:bg-secondary/50 transition-colors"
                >
                  <Avatar>
                    <AvatarImage src={member.profiles.avatar_url || undefined} alt="" />
                    <AvatarFallback>
                      {member.profiles.full_name?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">
                      {member.profiles.full_name || "Anonymous"}
                      {member.profiles.id === currentUserId && <span className="text-muted-foreground font-normal"> (you)</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {member.profiles.id === group.created_by ? "Creator · admin" : member.role === "admin" ? "Admin" : "Member"}
                    </p>
                  </div>
                </button>
                {/* Admins manage others: the creator can't be changed, and only the creator
                    removes or demotes other admins (the database checks the same rules). */}
                {isAdmin && member.profiles.id !== currentUserId && member.profiles.id !== group.created_by &&
                  (member.role !== "admin" || group.created_by === currentUserId) && (
                  <ActionMenu>
                    <ActionMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="mr-2 h-9 w-9 shrink-0 rounded-full" aria-label={`Manage ${member.profiles.full_name || "member"}`}>
                        <MoreHorizontal className="h-5 w-5" />
                      </Button>
                    </ActionMenuTrigger>
                    <ActionMenuContent align="end" title={member.profiles.full_name || "Member"}>
                      {member.role === "admin" ? (
                        <ActionMenuItem onSelect={() => changeRole(member, "member")}>
                          <ShieldOff className="h-4 w-4 mr-2" /> Remove as admin
                        </ActionMenuItem>
                      ) : (
                        <ActionMenuItem onSelect={() => changeRole(member, "admin")}>
                          <ShieldCheck className="h-4 w-4 mr-2" /> Make admin
                        </ActionMenuItem>
                      )}
                      <ActionMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm({ kind: "remove", member })}>
                        <UserMinus className="h-4 w-4 mr-2" /> Remove from group
                      </ActionMenuItem>
                    </ActionMenuContent>
                  </ActionMenu>
                )}
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>


      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === "leave" ? `Leave ${group.name}?`
            : confirm?.kind === "remove" ? `Remove ${confirm.member.profiles.full_name || "this person"}?`
            : "Delete this post?"
        }
        description={
          confirm?.kind === "leave"
            ? group.created_by === currentUserId
              ? "You created this group. You can join again later, and you'll still be able to edit it."
              : "You'll lose access to the chat, voice rooms and posts until you join again."
            : confirm?.kind === "remove"
              ? "They'll lose access to the group's posts, chat and voice rooms. They can join again if the group is public."
              : "This can't be undone."
        }
        confirmLabel={confirm?.kind === "leave" ? "Leave" : confirm?.kind === "remove" ? "Remove" : "Delete"}
        onConfirm={() => {
          if (confirm?.kind === "leave") handleLeaveGroup();
          else if (confirm?.kind === "remove") removeMember(confirm.member);
          else if (confirm?.kind === "post") handleDeletePost(confirm.id);
          setConfirm(null);
        }}
      />

      {currentUserId && (
        <AddGroupMembersDialog
          open={showAddPeople}
          onOpenChange={setShowAddPeople}
          groupId={group.id}
          groupName={group.name}
          currentUserId={currentUserId}
          memberIds={members.map((m) => m.profiles.id)}
          onAdded={() => loadMembers()}
        />
      )}
    </div>
  );
};

export default GroupDetail;
