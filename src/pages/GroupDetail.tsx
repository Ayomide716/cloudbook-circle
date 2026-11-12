import EmptyState from "@/components/EmptyState";
import PhotoViewer from "@/components/PhotoViewer";
import { useEffect, useMemo, useState } from "react";
import { useSingleFlight } from "@/hooks/use-single-flight";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { Loader2, UserPlus, Users, ArrowLeft, MessageCircle, Pencil, Video, Phone, Radio, Check, Globe, Lock, Clock, MoreHorizontal, ShieldCheck, ShieldOff, UserMinus, VolumeX, Volume2, CalendarDays, MapPin } from "@/components/icons";
import { HeaderAction } from "@/components/layout/PageHeader";
import { format, formatDistanceToNow } from "date-fns";
import ImageUpload from "@/components/ImageUpload";
import { useEffectEvent } from "@/hooks/use-effect-event";
import ConfirmDialog from "@/components/ConfirmDialog";
import GroupConversation from "@/components/groups/GroupConversation";
import GroupPostCard, { type GroupPostView } from "@/components/groups/GroupPostCard";
import AddGroupMembersDialog from "@/components/AddGroupMembersDialog";
import { ActionMenu, ActionMenuContent, ActionMenuItem, ActionMenuSeparator, ActionMenuTrigger } from "@/components/ui/action-menu";
import { dbChannel } from "@/lib/realtime";
import { Skeleton } from "@/components/ui/skeleton";
import { RowSkeleton } from "@/components/skeletons/parts";
import { PostSkeleton } from "@/components/skeletons/FeedSkeleton";
import { recordGroupVisit } from "@/lib/recent-groups";
import { cn, friendlyError } from "@/lib/utils";
import { features } from "@/lib/features";
import { categoryLabel } from "@/lib/group-categories";
import { cancelDelete, deleteLater } from "@/lib/pending-deletes";
import { ToastAction } from "@/components/ui/toast";
import PersonRow from "@/components/PersonRow";

interface Group {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_by: string;
  created_at?: string;
  category?: string | null;
  is_private?: boolean;
}

interface Person {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Member {
  id: string;
  role: string;
  muted_until?: string | null;
  profiles: Person;
}

interface JoinRequest {
  id: string;
  created_at: string;
  person: Person;
}

interface GroupEvent {
  id: string;
  name: string;
  start_date: string;
  location: string | null;
  cover_image: string | null;
}

type Section = "discussion" | "chat" | "members" | "events" | "photos" | "about" | "voice";

const isMuted = (m: Pick<Member, "muted_until">) => !!m.muted_until && Date.parse(m.muted_until) > Date.now();

const GroupDetail = () => {
  const { groupId } = useParams();
  // Menu → Your shortcuts lists the groups you open most first.
  useEffect(() => { if (groupId) recordGroupVisit(groupId); }, [groupId]);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [posts, setPosts] = useState<GroupPostView[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  // Faces on the header for people who haven't joined (members see the real list).
  const [preview, setPreview] = useState<Person[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [myRequest, setMyRequest] = useState(false);
  const [events, setEvents] = useState<GroupEvent[] | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [postContent, setPostContent] = useState("");
  const [postImage, setPostImage] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);
  // Non-members can't see the member list, so the count comes from the server.
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "leave" } | { kind: "post"; post: GroupPostView } | { kind: "remove"; member: Member } | null>(null);
  const [showAddPeople, setShowAddPeople] = useState(false);
  const [section, setSection] = useState<Section>("discussion");
  // A photo from the Photos tab, full screen (swipe through the group's photos).
  const [viewingPhoto, setViewingPhoto] = useState<number | null>(null);
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
      loadPreview(),
      loadMyRequest(),
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
        description: friendlyError(error),
        variant: "destructive",
      });
      return;
    }

    setGroup(data);
    // A group made as a chat in Messages opens on its Chat; it has Discussion and the rest too.
    if ((data as { is_chat?: boolean }).is_chat) setSection((s) => (s === "discussion" ? "chat" : s));
  };

  // One query for every author or member instead of one each.
  const fetchProfiles = async (ids: string[]) => {
    const unique = [...new Set(ids)];
    const map = new Map<string, Person>();
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

  const loadPreview = async () => {
    if (!groupId || !features.groupsV2) return;
    const { data } = await supabase.rpc("group_member_preview", { _group: groupId, _limit: 6 });
    setPreview((data ?? []).map((p) => ({ id: p.user_id, full_name: p.full_name, avatar_url: p.avatar_url })));
  };

  const loadMyRequest = async () => {
    if (!groupId || !currentUserId || !features.groupsV2) return;
    const { data } = await supabase.from("group_join_requests").select("id").eq("group_id", groupId).eq("user_id", currentUserId).maybeSingle();
    setMyRequest(!!data);
  };

  const loadRequests = async () => {
    if (!groupId || !features.groupsV2) return;
    const { data } = await supabase.from("group_join_requests").select("id, user_id, created_at").eq("group_id", groupId).order("created_at");
    const people = await fetchProfiles((data ?? []).map((r) => r.user_id));
    setRequests((data ?? []).map((r) => ({ id: r.id, created_at: r.created_at, person: people.get(r.user_id) ?? { id: r.user_id, full_name: null, avatar_url: null } })));
  };

  const loadEvents = async () => {
    if (!groupId) return;
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("events")
      .select("id, name, start_date, location, cover_image")
      .eq("group_id", groupId)
      .gte("start_date", since)
      .order("start_date")
      .limit(20);
    setEvents(data ?? []);
  };

  // Admins see who's asking to join; the events list loads when you open it.
  useEffect(() => { if (isAdmin) void loadRequests(); }, [isAdmin, groupId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (section === "events" && events === null) void loadEvents(); }, [section]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const profiles = await fetchProfiles((postsData ?? []).map((p) => p.user_id));
    setPosts((postsData ?? []).map((post) => ({
      ...post,
      author: profiles.get(post.user_id) ?? { full_name: null, avatar_url: null },
    })));
  };

  const managementError = (error: { message: string }) =>
    /Could not find the function|function .*group_member/i.test(error.message)
      ? "Managing members needs the latest database update."
      : friendlyError(error);

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

  const muteMember = async (member: Member, hours: number | null) => {
    if (!groupId) return;
    const until = hours === null ? null : new Date(Date.now() + hours * 3600 * 1000).toISOString();
    const { error } = await supabase.rpc("mute_group_member", { _group: groupId, _user: member.profiles.id, _until: until });
    if (error) {
      toast({ title: "Couldn't change that", description: friendlyError(error), variant: "destructive" });
      return;
    }
    const who = member.profiles.full_name || "They";
    toast({ title: hours === null ? `${who} can post again` : `${who} can't post for ${hours === 24 ? "a day" : "a week"}` });
    loadMembers();
  };

  // Which request is being answered, so a second tap on a slow connection does nothing.
  const [answering, setAnswering] = useState<string | null>(null);
  const answerRequest = async (request: JoinRequest, approve: boolean) => {
    if (answering) return;
    setAnswering(request.id);
    const { error } = approve
      ? await supabase.rpc("approve_group_request", { _request: request.id })
      : await supabase.from("group_join_requests").delete().eq("id", request.id);
    setAnswering(null);
    if (error) {
      toast({ title: "Couldn't answer that request", description: friendlyError(error), variant: "destructive" });
      return;
    }
    setRequests((list) => list.filter((r) => r.id !== request.id));
    if (approve) loadMembers();
  };

  const loadMembers = async () => {
    if (!groupId) return;
    const { data: membersData, error } = await supabase
      .from("group_members")
      .select("*")
      .eq("group_id", groupId);

    if (error) {
      console.error("Error loading members:", error);
      return;
    }

    const profiles = await fetchProfiles((membersData ?? []).map((m) => m.user_id));
    setMembers((membersData ?? [])
      .map((member) => ({
        id: member.id,
        role: member.role,
        muted_until: (member as { muted_until?: string | null }).muted_until ?? null,
        profiles: profiles.get(member.user_id) || { id: member.user_id, full_name: null, avatar_url: null },
      }))
      // Admins first, then by name.
      .sort((a, b) =>
        (a.role === "admin" ? 0 : 1) - (b.role === "admin" ? 0 : 1) ||
        (a.profiles.full_name || "").localeCompare(b.profiles.full_name || "")
      ));
    loadMemberCount();
  };

  const checkMembership = async () => {
    if (!currentUserId || !groupId) return;

    const { data } = await supabase
      .from("group_members")
      .select("*")
      .eq("group_id", groupId)
      .eq("user_id", currentUserId)
      .maybeSingle();

    setIsMember(!!data);
    setUserRole(data?.role || null);
    setMutedUntil((data as { muted_until?: string | null } | null)?.muted_until ?? null);
  };

  const handleJoinGroup = async () => {
    if (!currentUserId || !groupId || isJoining) return;
    setIsJoining(true);

    // Private group: ask, and an admin lets you in. (Shown as asked at once.)
    if (group?.is_private) {
      setMyRequest(true);
      const { error } = await supabase.from("group_join_requests").insert({ group_id: groupId, user_id: currentUserId });
      setIsJoining(false);
      if (error && error.code !== "23505") {
        setMyRequest(false);
        toast({ title: "Couldn't send your request", description: friendlyError(error), variant: "destructive" });
        return;
      }
      toast({ title: "Request sent", description: "You'll be told when an admin lets you in." });
      return;
    }

    // You're in at once; put back if it fails.
    setIsMember(true);
    setUserRole("member");
    const { error } = await supabase
      .from("group_members")
      .insert({
        group_id: groupId,
        user_id: currentUserId,
        role: "member",
      });

    setIsJoining(false);
    if (error) {
      setIsMember(false);
      setUserRole(null);
      toast({
        title: "Error joining group",
        description: friendlyError(error),
        variant: "destructive",
      });
      return;
    }

    await checkMembership();
    loadMembers();
    loadPosts();
  };

  const cancelRequest = async () => {
    if (!currentUserId || !groupId) return;
    const { error } = await supabase.from("group_join_requests").delete().eq("group_id", groupId).eq("user_id", currentUserId);
    if (error) {
      toast({ title: "Couldn't cancel your request", description: friendlyError(error), variant: "destructive" });
      return;
    }
    setMyRequest(false);
  };

  // You're out at once, with Undo for 5 seconds; you only really leave after that (or at once
  // if the app is closed first).
  const handleLeaveGroup = async () => {
    if (!currentUserId || !groupId) return;
    const role = userRole;
    const key = `leave-group:${groupId}`;
    setIsMember(false);
    setUserRole(null);
    deleteLater(key, 5000, {
      run: async () => {
        const { error } = await supabase
          .from("group_members")
          .delete()
          .eq("group_id", groupId)
          .eq("user_id", currentUserId);
        if (error) {
          setIsMember(true);
          setUserRole(role);
          toast({ title: "Couldn't leave the group", description: friendlyError(error), variant: "destructive" });
          return;
        }
        // Members-only content is no longer visible.
        setMembers([]);
        setPosts([]);
        loadMemberCount();
      },
    });
    toast({
      title: `You left ${group?.name ?? "the group"}`,
      duration: 5000,
      action: (
        <ToastAction altText="Undo leave group" onClick={() => { cancelDelete(key); setIsMember(true); setUserRole(role); }}>
          Undo
        </ToastAction>
      ),
    });
  };

  const handleDeletePost = async (post: GroupPostView) => {
    const { error } = await supabase.from("group_posts").delete().eq("id", post.id);
    if (error) {
      toast({ title: "Couldn't delete post", description: friendlyError(error), variant: "destructive" });
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
  };

  const togglePin = async (post: GroupPostView) => {
    const { error } = await supabase.rpc("set_group_post_pinned", { _post: post.id, _pinned: !post.pinned_at });
    if (error) {
      toast({ title: "Couldn't change that", description: friendlyError(error), variant: "destructive" });
      return;
    }
    toast({ title: post.pinned_at ? "Unpinned" : "Pinned to the top of the group" });
    loadPosts();
  };

  // Extra taps while this is saving do nothing (no double posts on a slow network).
  const onceHandleCreatePost = useSingleFlight();
  const handleCreatePost = onceHandleCreatePost(async (e: React.FormEvent) => {
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
        description: friendlyError(error),
        variant: "destructive",
      });
      return;
    }

    setPostContent("");
    setPostImage("");
    // Don't wait on realtime to show your own post.
    loadPosts();
  });

  // Pinned posts first (newest pin on top), then everything else, newest first.
  const pinned = useMemo(() => posts.filter((p) => p.pinned_at).sort((a, b) => Date.parse(b.pinned_at!) - Date.parse(a.pinned_at!)), [posts]);
  const rest = useMemo(() => posts.filter((p) => !p.pinned_at), [posts]);
  const photos = useMemo(() => posts.filter((p) => p.image_url), [posts]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        {/* The group's shape in grey while it loads, instead of a spinner. */}
        <div className="mx-auto max-w-2xl" aria-busy="true" aria-label="Loading group">
          <Skeleton className="h-44 w-full rounded-none sm:h-60 sm:rounded-2xl" />
          <div className="relative -mt-5 rounded-t-[22px] bg-background px-4 pb-3 pt-4 sm:mt-0">
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="mt-2.5 h-4 w-1/2" />
            <div className="mt-3 flex -space-x-2">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[30px] w-[30px] rounded-full border-2 border-background" />)}
            </div>
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-10 flex-1 rounded-xl" />
              <Skeleton className="h-10 flex-1 rounded-xl" />
            </div>
          </div>
          <div className="flex gap-5 border-b border-border px-4" aria-hidden="true">
            {["Discussion", "Chat", "Members", "Events"].map((l, i) => (
              <span key={l} className={cn("flex h-11 items-center text-[15px] font-semibold text-muted-foreground/60", i === 0 && "text-primary/60 shadow-[inset_0_-3px_0_hsl(var(--primary)/0.4)]")}>{l}</span>
            ))}
          </div>
          <PostSkeleton photo={false} />
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <EmptyState
          emoji="people"
          title="This group isn't available"
          text="It may have been deleted, or the link is wrong."
          className="min-h-[60vh] justify-center"
          action={<Button onClick={() => navigate("/groups")} className="rounded-full px-6">Back to Groups</Button>}
        />
      </div>
    );
  }

  // Only the group's admins (and whoever made it) can change its name, description and photo.
  // The database checks this too (update_group_details).
  const canEdit = isMember && (isAdmin || group.created_by === currentUserId);
  const faces = isMember ? members.map((m) => m.profiles) : preview;
  const count = isMember ? members.length : memberCount;
  const privacy = group.is_private ? "Private group" : "Public group";
  // "Tunde, Amara and 246 others are members" beside the faces.
  const memberLine = (people: { id: string; full_name: string | null }[]) => {
    const meFirst = [...people].sort((a, b) => Number(b.id === currentUserId) - Number(a.id === currentUserId));
    const names = meFirst.slice(0, 2).map((p) => (p.id === currentUserId ? "You" : p.full_name?.split(" ")[0])).filter(Boolean) as string[];
    const total = count ?? people.length;
    const others = Math.max(0, total - names.length);
    if (names.length === 0) return `${total.toLocaleString()} ${total === 1 ? "member" : "members"}`;
    const who = others > 0 ? `${names.join(", ")} and ${others.toLocaleString()} ${others === 1 ? "other" : "others"}` : names.join(" and ");
    if (names.length + others === 1) return names[0] === "You" ? "You're the only member" : `${who} is a member`;
    return `${who} are members`;
  };
  const meMuted = isMuted({ muted_until: mutedUntil });
  // A private group's posts, members and chat are for members only.
  const lockedOut = !isMember;

  const sections: { value: Section; label: string }[] = [
    { value: "discussion", label: "Discussion" },
    { value: "chat", label: "Chat" },
    { value: "members", label: requests.length ? `Members · ${requests.length} new` : "Members" },
    { value: "events", label: "Events" },
    { value: "photos", label: "Photos" },
    { value: "about", label: "About" },
    { value: "voice", label: "Voice" },
  ];

  const joinPrompt = (what: string) => (
    <Card className="feed-section">
      <EmptyState
        emoji={group.is_private ? "people" : "chat"}
        title={group.is_private ? "This group is private" : `Join to see ${what}`}
        text={group.is_private ? `Ask to join and an admin will let you in. Then you'll see ${what}.` : undefined}
      />
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId || undefined} />

      <div className="page-flush mx-auto max-w-4xl px-0 pb-6 sm:px-4 sm:py-6">
        {/* Group header, Facebook style: cover, name, privacy and members, one clear button */}
        <section className="feed-section mb-2 overflow-hidden border-b border-border bg-card sm:mb-4 sm:rounded-2xl sm:border">
          <div className="relative">
            {group.image_url ? (
              <img src={group.image_url} alt="" className="h-44 w-full object-cover sm:h-60" />
            ) : (
              <div className="h-32 w-full bg-gradient-to-br from-primary/25 via-primary/10 to-secondary sm:h-40" />
            )}
            <button
              type="button"
              onClick={() => navigate("/groups")}
              className="absolute left-3 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] flex h-10 w-10 items-center justify-center rounded-full bg-card/95 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-card md:top-3"
              aria-label="Back to groups"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowEditModal(true)}
                className="absolute right-3 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] flex h-10 items-center gap-1.5 rounded-full bg-card/95 px-3.5 text-sm font-semibold text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-card md:top-3"
                aria-label="Edit group"
              >
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}
          </div>

          <div className="relative -mt-5 space-y-3 rounded-t-[22px] bg-card px-4 pb-3 pt-4 sm:mt-0 sm:rounded-none sm:px-5 sm:pt-3">
            <div>
              <h1 className="font-display text-2xl font-extrabold leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-3xl">{group.name}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
                {group.is_private ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                <span>{privacy}</span>
                {count !== null && <><span aria-hidden="true">·</span><span><strong className="font-semibold text-foreground">{count.toLocaleString()}</strong> {count === 1 ? "member" : "members"}</span></>}
                {categoryLabel(group.category) && <><span aria-hidden="true">·</span><span>{categoryLabel(group.category)}</span></>}
              </p>
            </div>

            {faces.length > 0 && (
              <button type="button" onClick={() => setSection("members")} className="flex min-w-0 items-center gap-2.5 text-left" aria-label="See members">
                <span className="flex shrink-0 -space-x-2.5">
                  {faces.slice(0, 5).map((p) => (
                    <Avatar key={p.id} className="h-[30px] w-[30px] ring-2 ring-card">
                      <AvatarImage src={p.avatar_url || undefined} alt="" />
                      <AvatarFallback className="text-[10px]">{p.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                    </Avatar>
                  ))}
                </span>
                <span className="truncate text-[13px] text-muted-foreground">{memberLine(faces)}</span>
              </button>
            )}

            <div className="flex items-center gap-2">
              {isMember ? (
                <>
                  <ActionMenu>
                    <ActionMenuTrigger asChild>
                      <Button variant="secondary" className="flex-1 rounded-xl sm:flex-none" aria-label="Joined. Group options">
                        <Check className="mr-2 h-4 w-4" /> Joined
                      </Button>
                    </ActionMenuTrigger>
                    <ActionMenuContent align="start" title={group.name}>
                      <ActionMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm({ kind: "leave" })}>
                        <UserMinus className="mr-2 h-4 w-4" /> Leave group
                      </ActionMenuItem>
                    </ActionMenuContent>
                  </ActionMenu>
                  <Button variant="accent" className="flex-1 rounded-xl sm:flex-none" onClick={() => setShowAddPeople(true)}>
                    <UserPlus className="mr-2 h-4 w-4" /> Invite
                  </Button>
                  <HeaderAction icon={Phone} label="Start group voice call" onClick={() => startGroupCall(true)} />
                  <HeaderAction icon={Video} label="Start group video call" onClick={() => startGroupCall(false)} />
                </>
              ) : myRequest ? (
                <Button variant="secondary" className="flex-1 rounded-xl sm:flex-none" onClick={cancelRequest} aria-label="Requested. Cancel request?">
                  <Clock className="mr-2 h-4 w-4" /> Requested
                </Button>
              ) : (
                <Button variant="accent" className="flex-1 rounded-xl sm:flex-none" onClick={handleJoinGroup} disabled={isJoining}>
                  {isJoining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  {group.is_private ? "Ask to join" : "Join group"}
                </Button>
              )}
            </div>
          </div>

          <div role="group" aria-label="Group sections" className="flex gap-5 overflow-x-auto border-b border-border px-4 scrollbar-hide sm:px-5">
            {sections.map((o) => {
              const active = o.value === section;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setSection(o.value)}
                  aria-pressed={active}
                  className={cn(
                    "h-11 shrink-0 whitespace-nowrap text-[15px] transition-colors",
                    active ? "font-bold text-primary shadow-[inset_0_-3px_0_hsl(var(--primary))]" : "font-semibold text-muted-foreground hover:text-foreground"
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* A call is running in this group: offer to join it */}
        {callParticipants.length > 0 && (
          <Card className="feed-section mb-2 border-primary/40 bg-primary/5 p-3 sm:mb-4 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="flex shrink-0 -space-x-2">
                {callParticipants.slice(0, 3).map((p) => (
                  <Avatar key={p.userId} className="h-9 w-9 ring-2 ring-background">
                    <AvatarImage src={p.avatar || undefined} alt="" />
                    <AvatarFallback className="text-xs">{p.name?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                  {callParticipants.some((p) => p.video) ? "Video" : "Voice"} call in progress
                </p>
                <p className="truncate text-xs text-muted-foreground">{callParticipants.map((p) => p.name).join(", ")}</p>
              </div>
              <Button size="sm" variant="accent" onClick={() => joinGroupCall({ id: group.id, name: group.name }, !callParticipants.some((p) => p.video))} className="shrink-0 rounded-full px-4">
                Join
              </Button>
            </div>
          </Card>
        )}

        {canEdit && <EditGroupModal group={group} open={showEditModal} onOpenChange={setShowEditModal} onGroupUpdated={loadGroup} />}

        {section === "discussion" && (
          <div className="space-y-2 sm:space-y-3">
            {isMember && !meMuted && (
              <Card className="feed-section p-4">
                <form onSubmit={handleCreatePost} className="space-y-3">
                  <Textarea
                    placeholder="Write something to the group…"
                    aria-label="Write something to the group"
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    className="min-h-[80px] border-0 bg-secondary/60 text-[15px] focus-visible:ring-1"
                    disabled={isPosting}
                  />
                  <div className="flex items-end justify-between gap-3">
                    <ImageUpload bucket="post-images" userId={currentUserId!} onUploadComplete={setPostImage} currentImage={postImage} label="Photo" />
                    <Button type="submit" className="shrink-0 rounded-full px-5" disabled={isPosting || (!postContent.trim() && !postImage)}>
                      {isPosting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
                    </Button>
                  </div>
                </form>
              </Card>
            )}
            {isMember && meMuted && (
              <p className="feed-section flex items-center gap-2 bg-secondary px-4 py-3 text-sm text-muted-foreground sm:rounded-xl">
                <VolumeX className="h-4 w-4 shrink-0" /> An admin has paused your posting until {format(new Date(mutedUntil!), "d MMM, h:mm a")}.
              </p>
            )}

            {lockedOut ? joinPrompt("posts") : posts.length === 0 ? (
              <Card className="feed-section">
                <EmptyState emoji="chat" title="No posts yet" text="Be the first to share something." />
              </Card>
            ) : (
              <>
                {pinned.map((p) => (
                  <GroupPostCard key={p.id} post={p} currentUserId={currentUserId!} canManage={isAdmin} onDelete={(post) => setConfirm({ kind: "post", post })} onTogglePin={togglePin} />
                ))}
                {rest.map((p) => (
                  <GroupPostCard key={p.id} post={p} currentUserId={currentUserId!} canManage={isAdmin} onDelete={(post) => setConfirm({ kind: "post", post })} onTogglePin={features.groupsV2 ? togglePin : undefined} />
                ))}
              </>
            )}
          </div>
        )}

        {section === "chat" && (
          lockedOut ? joinPrompt("the chat") : (
            // The group's chat, in the same style as Messages (it shows in Chats once people use it).
            <div className="feed-section h-[calc(100dvh-10rem-env(safe-area-inset-bottom,0px))] min-h-[380px] overflow-hidden rounded-[1.125rem] border bg-card md:h-[calc(100dvh-22rem)] md:min-h-[420px]">
              <GroupConversation
                embedded
                group={{ ...group, created_at: group.created_at ?? new Date().toISOString() }}
                currentUserId={currentUserId!}
                onBack={() => {}}
                onSeen={() => {}}
                onLeft={() => {}}
              />
            </div>
          )
        )}

        {section === "voice" && (
          lockedOut || !currentUserId ? joinPrompt("voice rooms") : <VoiceRooms groupId={groupId!} currentUserId={currentUserId} />
        )}

        {section === "members" && (
          lockedOut ? joinPrompt("who's in it") : (
            <div className="space-y-2 sm:space-y-3">
              {isAdmin && requests.length > 0 && (
                <section className="feed-section border-y border-border/60 bg-card sm:rounded-2xl sm:border" aria-label="Requests to join">
                  <h2 className="px-4 pt-3 text-[15px] font-semibold">Requests to join · {requests.length}</h2>
                  <div className="divide-y divide-border">
                    {requests.map((r) => (
                      <PersonRow
                        key={r.id}
                        id={r.person.id}
                        name={r.person.full_name}
                        avatarUrl={r.person.avatar_url}
                        subtitle={`Asked ${formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}`}
                        className="py-2.5"
                        actions={<>
                          <Button size="sm" variant="accent" className="h-9 rounded-lg px-3" disabled={answering === r.id} onClick={() => answerRequest(r, true)}>Approve</Button>
                          <Button size="sm" variant="secondary" className="h-9 rounded-lg px-3" disabled={answering === r.id} onClick={() => answerRequest(r, false)}>Decline</Button>
                        </>}
                      />
                    ))}
                  </div>
                </section>
              )}

              <section className="feed-section border-y border-border/60 bg-card sm:rounded-2xl sm:border" aria-label="Members">
                <div className="flex items-center justify-between px-4 pt-3">
                  <h2 className="text-[15px] font-semibold">Members · {members.length}</h2>
                  <Button variant="secondary" size="sm" className="h-8 rounded-lg" onClick={() => setShowAddPeople(true)}>
                    <UserPlus className="mr-1.5 h-4 w-4" /> Invite
                  </Button>
                </div>
                <div className="divide-y divide-border">
                  {members.map((member) => {
                    const muted = isMuted(member);
                    const manageable = isAdmin && member.profiles.id !== currentUserId && member.profiles.id !== group.created_by &&
                      (member.role !== "admin" || group.created_by === currentUserId);
                    return (
                      <div key={member.id} className="flex items-center">
                        <PersonRow
                          id={member.profiles.id}
                          name={member.profiles.id === currentUserId ? `${member.profiles.full_name || "You"} (you)` : member.profiles.full_name}
                          avatarUrl={member.profiles.avatar_url}
                          subtitle={<span className="flex items-center gap-1">
                            {member.profiles.id === group.created_by ? "Creator · admin" : member.role === "admin" ? "Admin" : "Member"}
                            {muted && <><span aria-hidden="true">·</span><VolumeX className="h-3.5 w-3.5" /> Muted</>}
                          </span>}
                          className="min-w-0 flex-1 py-2.5"
                        />
                        {/* Admins manage others: the creator can't be changed, and only the creator
                            removes or demotes other admins (the database checks the same rules). */}
                        {manageable && (
                          <ActionMenu>
                            <ActionMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="mr-2 h-9 w-9 shrink-0 rounded-full" aria-label={`Manage ${member.profiles.full_name || "member"}`}>
                                <MoreHorizontal className="h-5 w-5" />
                              </Button>
                            </ActionMenuTrigger>
                            <ActionMenuContent align="end" title={member.profiles.full_name || "Member"}>
                              {member.role === "admin" ? (
                                <ActionMenuItem onSelect={() => changeRole(member, "member")}>
                                  <ShieldOff className="mr-2 h-4 w-4" /> Remove as admin
                                </ActionMenuItem>
                              ) : (
                                <ActionMenuItem onSelect={() => changeRole(member, "admin")}>
                                  <ShieldCheck className="mr-2 h-4 w-4" /> Make admin
                                </ActionMenuItem>
                              )}
                              {features.groupsV2 && member.role !== "admin" && (
                                muted ? (
                                  <ActionMenuItem onSelect={() => muteMember(member, null)}>
                                    <Volume2 className="mr-2 h-4 w-4" /> Let them post again
                                  </ActionMenuItem>
                                ) : (
                                  <>
                                    <ActionMenuItem onSelect={() => muteMember(member, 24)}>
                                      <VolumeX className="mr-2 h-4 w-4" /> Mute for a day
                                    </ActionMenuItem>
                                    <ActionMenuItem onSelect={() => muteMember(member, 24 * 7)}>
                                      <VolumeX className="mr-2 h-4 w-4" /> Mute for a week
                                    </ActionMenuItem>
                                  </>
                                )
                              )}
                              <ActionMenuSeparator />
                              <ActionMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm({ kind: "remove", member })}>
                                <UserMinus className="mr-2 h-4 w-4" /> Remove from group
                              </ActionMenuItem>
                            </ActionMenuContent>
                          </ActionMenu>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )
        )}

        {section === "events" && (
          <section className="feed-section border-y border-border/60 bg-card sm:rounded-2xl sm:border" aria-label="Events">
            {events === null ? (
              [0, 1].map((r) => <RowSkeleton key={r} />)
            ) : events.length === 0 ? (
              <EmptyState
                emoji="calendar"
                title="No upcoming events"
                text="Plan a meetup, a service or a match for the group."
                action={isMember ? <Button onClick={() => navigate("/events")} className="rounded-full px-5">Create an event</Button> : undefined}
              />
            ) : (
              <div className="divide-y divide-border">
                {events.map((ev) => {
                  const d = new Date(ev.start_date);
                  return (
                    <Link key={ev.id} to="/events" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50">
                      <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-secondary">
                        <span className="text-[11px] font-bold uppercase text-primary">{format(d, "MMM")}</span>
                        <span className="text-lg font-bold leading-none">{format(d, "d")}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{ev.name}</span>
                        <span className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5 shrink-0" />{format(d, "EEE, h:mm a")}
                          {ev.location && <><span aria-hidden="true">·</span><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{ev.location}</span></>}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {section === "photos" && (
          lockedOut ? joinPrompt("photos") : photos.length === 0 ? (
            <Card className="feed-section"><EmptyState emoji="camera" title="No photos yet" text="Photos shared in the group's posts show up here." /></Card>
          ) : (
            <div className="feed-section grid grid-cols-3 gap-0.5 overflow-hidden sm:gap-1 sm:rounded-2xl">
              {photos.map((p, i) => (
                <button key={p.id} type="button" onClick={() => setViewingPhoto(i)} className="aspect-square bg-secondary" aria-label="View photo">
                  <img src={p.image_url!} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                </button>
              ))}
              <PhotoViewer images={photos.map((p) => p.image_url!)} index={viewingPhoto} onIndexChange={setViewingPhoto} />
            </div>
          )
        )}

        {section === "about" && (
          <section className="feed-section space-y-4 border-y border-border/60 bg-card p-4 sm:rounded-2xl sm:border sm:p-5" aria-label="About this group">
            <div>
              <h2 className="text-[17px] font-bold">About</h2>
              <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground/90">
                {group.description || "No description yet."}
              </p>
            </div>
            <ul className="space-y-3 text-[15px]">
              <li className="flex gap-3">
                {group.is_private ? <Lock className="mt-0.5 h-5 w-5 shrink-0" /> : <Globe className="mt-0.5 h-5 w-5 shrink-0" />}
                <span>
                  <span className="block font-semibold">{privacy}</span>
                  <span className="text-sm text-muted-foreground">
                    {group.is_private ? "Only members see posts, members and the chat. People ask to join and admins let them in." : "Anyone on Ember can join and see posts."}
                  </span>
                </span>
              </li>
              {categoryLabel(group.category) && (
                <li className="flex gap-3"><Users className="mt-0.5 h-5 w-5 shrink-0" /><span className="font-semibold">{categoryLabel(group.category)}</span></li>
              )}
              {group.created_at && (
                <li className="flex gap-3"><CalendarDays className="mt-0.5 h-5 w-5 shrink-0" /><span>Created {format(new Date(group.created_at), "d MMMM yyyy")}</span></li>
              )}
            </ul>
            {isMember && members.some((m) => m.role === "admin") && (
              <div>
                <h3 className="mb-2 text-[15px] font-semibold">Admins</h3>
                <div className="flex flex-wrap gap-2">
                  {members.filter((m) => m.role === "admin").map((m) => (
                    <Link key={m.id} to={`/profile/${m.profiles.id}`} className="flex items-center gap-2 rounded-full bg-secondary py-1 pl-1 pr-3 text-sm font-medium">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={m.profiles.avatar_url || undefined} alt="" />
                        <AvatarFallback className="text-[10px]">{m.profiles.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                      </Avatar>
                      {m.profiles.full_name || "Admin"}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
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
              : group.is_private
                ? "It's a private group: you'll need to ask again to get back in."
                : "You'll lose access to the chat, voice rooms and posts until you join again."
            : confirm?.kind === "remove"
              ? group.is_private
                ? "They'll lose access to the group's posts, chat and voice rooms, and would have to ask to join again."
                : "They'll lose access to the group's posts, chat and voice rooms. They can join again if the group is public."
              : "This can't be undone."
        }
        confirmLabel={confirm?.kind === "leave" ? "Leave" : confirm?.kind === "remove" ? "Remove" : "Delete"}
        onConfirm={() => {
          if (confirm?.kind === "leave") handleLeaveGroup();
          else if (confirm?.kind === "remove") removeMember(confirm.member);
          else if (confirm?.kind === "post") handleDeletePost(confirm.post);
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
