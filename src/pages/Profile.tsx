import { postImages } from "@/lib/post-images";
import { features } from "@/lib/features";
import { useEffect, useState, useRef } from "react";
import { displayUrl, safeWebsiteUrl } from "@/lib/safe-url";
import { fetchPostInteractions, usePostInteractions } from "@/hooks/use-post-interactions";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import PostCard from "@/components/PostCard";
import FriendshipButton from "@/components/FriendshipButton";
import EditProfileModal from "@/components/EditProfileModal";
import OnlineStatusIndicator from "@/components/OnlineStatusIndicator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Edit,
  MessageCircle,
  MapPin,
  Briefcase,
  GraduationCap,
  Link as LinkIcon,
  Heart,
  MessageSquare,
  Image as ImageIcon,
  Users,
  Plus,
  FolderOpen,
  Trash2,
  X,
  Loader2,
  Images,
  ChevronLeft,
  MoreHorizontal,
  Search,
  Home,
  Cake,
  Clock,
  Play,
  Ban,
  Flag,
  Share2 } from
"lucide-react";
import { ActionMenu, ActionMenuContent, ActionMenuItem, ActionMenuSeparator, ActionMenuTrigger } from "@/components/ui/action-menu";
import ReportDialog from "@/components/ReportDialog";
import BlockDialog from "@/components/BlockDialog";
import { isBlockedWith, unblockUser } from "@/lib/blocking";
import { birthdayLabel, relationshipLabel } from "@/lib/profile-details";
import ImageUpload from "@/components/ImageUpload";
import VerifiedBadge from "@/components/VerifiedBadge";
import ProfileSkeleton from "@/components/skeletons/ProfileSkeleton";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { cn, getErrorMessage } from "@/lib/utils";
import AnonymousQA from "@/components/AnonymousQA";
import CreatorSubscriptions from "@/components/CreatorSubscriptions";
import type { LucideIcon } from "lucide-react";
import { useEffectEvent } from "@/hooks/use-effect-event";

interface ProfileData {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  work: string | null;
  education: string | null;
  hometown?: string | null;
  birthday?: string | null;
  relationship_status?: string | null;
  is_verified?: boolean;
  created_at?: string | null;
}

interface Post {
  id: string;
  content: string;
  image_url: string | null;
  image_urls?: string[] | null;
  video_url?: string | null;
  created_at: string | null;
  user_id: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface Album {
  id: string;
  name: string;
  description: string | null;
  user_id: string;
  created_at: string | null;
  photos: AlbumPhoto[];
}

interface AlbumPhoto {
  id: string;
  album_id: string;
  image_url: string;
  caption: string | null;
  created_at: string | null;
}

const spring = { type: "spring" as const, stiffness: 260, damping: 28 };

const Profile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [seoName, setSeoName] = useState<string | null>(null);
  useSEO({ title: seoName ?? "Profile", description: seoName ? `${seoName} on Ember.` : "View user profile on Ember." });
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const { reactionsData, setReactionsData, commentsData, setCommentsData, toggleReaction, reloadComments } = usePostInteractions();
  const [friendCount, setFriendCount] = useState<number | null>(0);
  const [activeTab, setActiveTab] = useState<"posts" | "photos" | "videos" | "albums" | "qa">("posts");

  // Albums state
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [newAlbumDesc, setNewAlbumDesc] = useState("");
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [createAlbumOpen, setCreateAlbumOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<{ kind: "album"; id: string } | { kind: "photo"; id: string } | null>(null);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);


  // Mutual friends state
  const [mutualFriends, setMutualFriends] = useState<{id: string;full_name: string | null;avatar_url: string | null;}[]>([]);
  // Someone else's profile: groups you're both in, and the same town or school.
  const [thingsInCommon, setThingsInCommon] = useState<string[]>([]);
  // Blocking: "by_me" shows an Unblock button; "by_them" shows that the profile isn't available.
  const [blockState, setBlockState] = useState<"none" | "by_me" | "by_them">("none");
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const coverRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const coverY = useTransform(scrollY, [0, 300], [0, 100]);
  const coverScale = useTransform(scrollY, [0, 300], [1, 1.15]);

  const checkAuth = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {navigate("/auth");return;}
    setCurrentUserId(session.user.id);
  });

  useEffect(() => {
    checkAuth();
  }, [navigate, checkAuth]);

  // Runs once both the profile id and who you are are known: reactions, comments and
  // mutual friends depend on the signed-in user (they silently loaded nothing before).
  const loadProfile = useEffectEvent(async () => {
    if (!userId || !currentUserId) return;
    setIsLoading(true);
    const { data: profileData, error: profileError } = await supabase.
    from("profiles").select("*").eq("id", userId).maybeSingle();
    if (profileError) {
      toast({ title: "Error loading profile", description: profileError.message, variant: "destructive" });
      setIsLoading(false);
      return;
    }
    if (!profileData) {
      toast({ title: "Profile not found", variant: "destructive" });
      setIsLoading(false);
      return;
    }
    setProfile(profileData);
    setSeoName(profileData.full_name);

    if (features.blocking && userId !== currentUserId && await isBlockedWith(userId)) {
      const { data: mine } = await supabase.from("blocks").select("id").eq("blocker_id", currentUserId).eq("blocked_id", userId).maybeSingle();
      setBlockState(mine ? "by_me" : "by_them");
      setPosts([]);
      setIsLoading(false);
      return;
    }
    setBlockState("none");

    loadFriendStats();
    loadThingsInCommon(profileData);

    const { data: postsData, error: postsError } = await supabase.
    from("posts").
    select(`*, profiles:user_id (id, full_name, avatar_url)`).
    eq("user_id", userId).
    order("created_at", { ascending: false });

    if (postsError) {
      toast({ title: "Error loading posts", description: postsError.message, variant: "destructive" });
    } else {
      setPosts(postsData || []);
      loadPostsData(postsData || []);
    }
    // Load albums
    loadAlbums();
    setIsLoading(false);
  });

  useEffect(() => {
    if (userId && currentUserId) loadProfile();
  }, [userId, currentUserId, loadProfile]);

  /**
   * Friend count and mutual friends. Other people's friendships are private, so this uses a
   * database function that returns only the counts; until it's installed, someone else's
   * count is hidden rather than shown as 0.
   */
  const loadFriendStats = async () => {
    if (!userId || !currentUserId) return;
    const { data, error } = await supabase.rpc("profile_friend_stats", { _user_id: userId });
    const stats = data?.[0];
    if (error || !stats) {
      setMutualFriends([]);
      if (currentUserId !== userId) { setFriendCount(null); return; }
      const { count } = await supabase
        .from("friendships")
        .select("id", { count: "exact", head: true })
        .eq("status", "accepted")
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
      setFriendCount(count ?? 0);
      return;
    }
    setFriendCount(Number(stats.friend_count));
    const mutualIds = stats.mutual_ids ?? [];
    if (!mutualIds.length) { setMutualFriends([]); return; }
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", mutualIds.slice(0, 20));
    setMutualFriends(profiles || []);
  };

  const loadThingsInCommon = async (other: ProfileData) => {
    if (!currentUserId || other.id === currentUserId) { setThingsInCommon([]); return; }
    const [{ data: me }, { data: mine }] = await Promise.all([
      supabase.from("profiles").select((features.profileDetails ? "location, education, hometown" : "location, education") as "location, education, hometown").eq("id", currentUserId).maybeSingle(),
      supabase.from("group_members").select("group_id").eq("user_id", currentUserId),
    ]);
    const myGroups = (mine ?? []).map((g) => g.group_id);
    const { data: shared } = myGroups.length
      ? await supabase.from("group_members").select("groups(name)").eq("user_id", other.id).in("group_id", myGroups).limit(3)
      : { data: [] };
    const same = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
    const items = (shared ?? []).map((row) => (row as { groups: { name: string } | null }).groups?.name).filter(Boolean) as string[];
    if (same(me?.location, other.location)) items.push(other.location!);
    if (same(me?.hometown, other.hometown) && !items.includes(other.hometown!)) items.push(other.hometown!);
    if (same(me?.education, other.education)) items.push(other.education!);
    setThingsInCommon(items.slice(0, 4));
  };

  const shareProfile = async () => {
    const url = `${window.location.origin}/profile/${userId}`;
    try {
      if (navigator.share) { await navigator.share({ title: profile?.full_name || "Ember profile", url }); return; }
      await navigator.clipboard.writeText(url);
      toast({ title: "Profile link copied" });
    } catch { /* share sheet closed */ }
  };

  const loadAlbums = async () => {
    if (!userId) return;
    const { data: albumsData } = await supabase.
    from("albums").
    select("*").
    eq("user_id", userId).
    order("created_at", { ascending: false });

    if (albumsData) {
      // All albums' photos in one query rather than one per album.
      const { data: photos } = albumsData.length
        ? await supabase.from("album_photos").select("*").in("album_id", albumsData.map((a) => a.id)).order("created_at", { ascending: false })
        : { data: [] as AlbumPhoto[] };
      setAlbums(albumsData.map((album) => ({ ...album, photos: (photos ?? []).filter((ph) => ph.album_id === album.id) })));
    }
  };

  const createAlbum = async () => {
    if (!currentUserId || !newAlbumName.trim()) return;
    setIsCreatingAlbum(true);
    const { error } = await supabase.from("albums").insert({
      name: newAlbumName.trim(),
      description: newAlbumDesc.trim() || null,
      user_id: currentUserId
    });
    if (error) {
      toast({ title: "Error creating album", description: error.message, variant: "destructive" });
    } else {
      setNewAlbumName("");
      setNewAlbumDesc("");
      setCreateAlbumOpen(false);
      loadAlbums();
    }
    setIsCreatingAlbum(false);
  };

  const deleteAlbum = async (albumId: string) => {
    const { error } = await supabase.from("albums").delete().eq("id", albumId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setSelectedAlbum(null);
      loadAlbums();
    }
  };

  const uploadPhotoToAlbum = async (albumId: string, file: File) => {
    if (!currentUserId) return;
    setIsUploadingPhoto(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${currentUserId}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from("post-images").upload(fileName, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("post-images").getPublicUrl(fileName);

      const { error: insertError } = await supabase.from("album_photos").insert({
        album_id: albumId,
        image_url: urlData.publicUrl
      });
      if (insertError) throw insertError;
      loadAlbums();
    } catch (error) {
      toast({ title: "Upload failed", description: getErrorMessage(error), variant: "destructive" });
    }
    setIsUploadingPhoto(false);
  };

  const deletePhoto = async (photoId: string) => {
    const { error } = await supabase.from("album_photos").delete().eq("id", photoId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      loadAlbums();
    }
  };

  const loadPostsData = async (postsData: Post[]) => {
    if (!currentUserId || postsData.length === 0) return;
    const { reactions, comments } = await fetchPostInteractions(postsData.map((p) => p.id), currentUserId);
    setReactionsData(reactions);
    setCommentsData(comments);
  };

  const handleAvatarUpload = async (url: string) => {
    if (!profile) return;
    const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
    if (error) {toast({ title: "Error", description: error.message, variant: "destructive" });return;}
    setProfile({ ...profile, avatar_url: url });
  };

  const handleCoverUpload = async (url: string) => {
    if (!profile) return;
    const { error } = await supabase.from("profiles").update({ cover_url: url }).eq("id", profile.id);
    if (error) {toast({ title: "Error", description: error.message, variant: "destructive" });return;}
    setProfile({ ...profile, cover_url: url });
  };

  const startMessage = () => {
    if (!userId) return;
    navigate(`/messages?user=${userId}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <ProfileSkeleton />
      </div>);

  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <div className="flex items-center justify-center h-[60vh]">
          <p className="text-muted-foreground">Profile not found</p>
        </div>
      </div>);

  }

  const isOwnProfile = currentUserId === userId;

  if (blockState !== "none") {
    const name = profile.full_name || "this person";
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <main className="max-w-md mx-auto px-6 py-16 text-center">
          {blockState === "by_me" ?
          <>
              <Avatar className="h-24 w-24 mx-auto mb-4">
                <AvatarImage src={profile.avatar_url || undefined} alt="" />
                <AvatarFallback className="text-3xl">{profile.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
              </Avatar>
              <h1 className="text-xl font-bold mb-1">You blocked {name}</h1>
              <p className="text-muted-foreground mb-6">You won't see each other's posts, and you can't message or add each other as friends.</p>
              <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await unblockUser(currentUserId!, profile.id);
                  toast({ title: `You unblocked ${name}` });
                  loadProfile();
                } catch (error) {
                  toast({ title: "Couldn't unblock", description: getErrorMessage(error), variant: "destructive" });
                }
              }}>
                Unblock
              </Button>
            </> :
          <>
              <Ban className="h-12 w-12 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
              <h1 className="text-xl font-bold mb-1">This profile isn't available</h1>
              <p className="text-muted-foreground mb-6">The link may be broken, or the profile may have been removed.</p>
              <Button variant="secondary" onClick={() => navigate("/")}>Go to feed</Button>
            </>
          }
        </main>
      </div>);
  }

  // ··· on the cover (phones) and beside Message: share, and for others report or block.
  const profileMenu = (trigger: React.ReactNode) =>
  <ActionMenu>
      <ActionMenuTrigger asChild>{trigger}</ActionMenuTrigger>
      <ActionMenuContent align="end">
        <ActionMenuItem onSelect={shareProfile}>
          <Share2 className="h-4 w-4 mr-2" /> Share profile
        </ActionMenuItem>
        {!isOwnProfile &&
      <>
            <ActionMenuSeparator />
            <ActionMenuItem onSelect={() => setReportOpen(true)}>
              <Flag className="h-4 w-4 mr-2" /> Report profile
            </ActionMenuItem>
            {features.blocking &&
          <ActionMenuItem onSelect={() => setBlockOpen(true)} className="text-destructive focus:text-destructive">
                <Ban className="h-4 w-4 mr-2" /> Block
              </ActionMenuItem>
          }
          </>
      }
      </ActionMenuContent>
    </ActionMenu>;

  const photoPosts = posts.filter((p) => postImages(p).length > 0);
  const videoPosts = posts.filter((p) => p.video_url);
  const relationship = relationshipLabel(profile.relationship_status);
  const birthday = birthdayLabel(profile.birthday);

  // The short line under the bio, as on Facebook: "📍 Lagos · 🎓 UNILAG · ❤ Single".
  const summaryItems = [
  profile.location && { icon: MapPin, label: profile.location },
  (profile.education || profile.work) && { icon: profile.education ? GraduationCap : Briefcase, label: (profile.education || profile.work)! },
  relationship && { icon: Heart, label: relationship }].
  filter(Boolean) as {icon: LucideIcon;label: string;}[];

  const infoItems = [
  profile.location && { icon: Home, label: profile.location, prefix: "Lives in" },
  profile.hometown && { icon: MapPin, label: profile.hometown, prefix: "From" },
  // Work holds a job title or a company ("Frontend Developer", "Paystack"), so it stands alone.
  profile.work && { icon: Briefcase, label: profile.work },
  profile.education && { icon: GraduationCap, label: profile.education, prefix: "Studied at" },
  birthday && { icon: Cake, label: birthday, prefix: "Birthday" },
  relationship && { icon: Heart, label: relationship },
  profile.created_at && { icon: Clock, label: new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }), prefix: "Joined" },
  // Only http(s) links, so a "javascript:" website can't run code when clicked.
  profile.website && { icon: LinkIcon, label: profile.website, href: safeWebsiteUrl(profile.website) }].
  filter(Boolean) as {icon: LucideIcon;label: string;prefix?: string;href?: string | null;}[];
  const hasDetails = infoItems.some((item) => item.prefix !== "Joined");

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId || undefined} hideMobileTopBar />

      {/* ─── Cover: runs to the top of the screen on phones, with back / more / search over it ─── */}
      <div className="max-w-5xl mx-auto sm:px-6">
        <div ref={coverRef} className="relative h-48 sm:h-72 overflow-hidden bg-muted sm:rounded-b-2xl">
          <motion.div style={{ y: coverY, scale: coverScale }} className="absolute inset-0">
            {profile.cover_url ?
            <img src={profile.cover_url} alt="" className="w-full h-full object-cover" /> :
            // No cover yet: soft ember glows on the page colour, calmer than a flat gradient.
            <div className="h-full w-full bg-[radial-gradient(110%_130%_at_0%_0%,hsl(var(--primary)/0.55),transparent_55%),radial-gradient(90%_120%_at_100%_100%,hsl(340_90%_62%/0.4),transparent_60%),radial-gradient(60%_80%_at_70%_10%,hsl(40_100%_60%/0.35),transparent_60%),linear-gradient(160deg,hsl(var(--secondary)),hsl(var(--background)))]" />
            }
          </motion.div>
          <div className="md:hidden absolute inset-x-0 top-0 z-10 flex items-center justify-between px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))} aria-label="Back"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <div className="flex gap-2">
              {profileMenu(
              <button type="button" aria-label="Profile options"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm">
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              )}
              <button type="button" onClick={() => navigate("/explore")} aria-label="Search"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm">
                <Search className="h-5 w-5" />
              </button>
            </div>
          </div>
          {isOwnProfile &&
          <div className="absolute right-3 bottom-8 sm:bottom-3 z-10">
              <ImageUpload
              bucket="avatars"
              userId={currentUserId!}
              onUploadComplete={handleCoverUpload}
              label="Edit cover"
              variant="pill" />
            </div>
          }
        </div>
      </div>

      <div className="page-flush max-w-5xl mx-auto px-0 sm:px-6 pb-28 md:pb-10">
        {/* ─── Header, as in Facebook: a white sheet over the cover with the photo, name and stats ─── */}
        <header className="relative -mt-5 sm:mt-0 rounded-t-3xl sm:rounded-none bg-card sm:bg-transparent px-4 sm:px-0 pt-3 pb-4 mb-2 sm:mb-4">
          <div className="flex items-end gap-4">
            <div className="relative -mt-14 sm:-mt-20 w-fit flex-shrink-0">
              <Avatar className="h-28 w-28 sm:h-40 sm:w-40 border-4 border-card sm:border-background shadow-lg">
                <AvatarImage src={profile.avatar_url || undefined} alt="" />
                <AvatarFallback className="text-4xl sm:text-5xl font-display gradient-brand text-primary-foreground">
                  {profile.full_name?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              {/* Own profile: camera button to change the photo. Others: online dot. Never both in one corner. */}
              {isOwnProfile ?
              <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2">
                  <ImageUpload
                  bucket="avatars"
                  userId={currentUserId!}
                  onUploadComplete={handleAvatarUpload}
                  label="Change profile photo"
                  variant="avatar" />
                </div> :
              <div className="absolute bottom-3 right-3">
                  <OnlineStatusIndicator userId={userId || ""} />
                </div>
              }
            </div>

            <div className="min-w-0 flex-1 pb-1 sm:pb-3">
              <h1 className="text-[22px] sm:text-3xl font-bold leading-tight flex items-center gap-1.5 [overflow-wrap:anywhere]">
                {profile.full_name || "Anonymous User"}
                {profile.is_verified && <VerifiedBadge size="lg" />}
              </h1>
              {/* "245 friends · 10 mutual · 153 posts" */}
              <p className="mt-0.5 text-[15px] text-muted-foreground">
                {isOwnProfile ?
                <button onClick={() => navigate("/friends")} className="hover:underline"><strong className="font-semibold text-foreground">{friendCount ?? "–"}</strong> {friendCount === 1 ? "friend" : "friends"}</button> :
                <span><strong className="font-semibold text-foreground">{friendCount ?? "–"}</strong> {friendCount === 1 ? "friend" : "friends"}</span>
                }
                {!isOwnProfile && mutualFriends.length > 0 && <> · <strong className="font-semibold text-foreground">{mutualFriends.length}</strong> mutual</>}
                {" · "}<strong className="font-semibold text-foreground">{posts.length}</strong> {posts.length === 1 ? "post" : "posts"}
              </p>
            </div>
          </div>

          {profile.bio &&
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed whitespace-pre-wrap break-words">{profile.bio}</p>
          }

          {/* Short details line: 📍 Lagos · 🎓 UNILAG · ❤ Single */}
          {summaryItems.length > 0 &&
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[15px]">
              {summaryItems.map((item, i) =>
            <span key={item.label} className="inline-flex items-center gap-1">
                  {i > 0 && <span className="text-muted-foreground" aria-hidden="true">·</span>}
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </span>
            )}
            </p>
          }

          {/* Mutual friends: faces and names */}
          {!isOwnProfile && mutualFriends.length > 0 &&
          <div className="mt-3 flex items-center gap-2.5">
              <div className="flex -space-x-2 shrink-0" aria-hidden="true">
                {mutualFriends.slice(0, 3).map((f) =>
              <Avatar key={f.id} className="h-8 w-8 ring-2 ring-card">
                    <AvatarImage src={f.avatar_url || undefined} alt="" />
                    <AvatarFallback className="text-[10px]">{f.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
              )}
              </div>
              <p className="text-sm text-muted-foreground leading-snug">
                Friends with {mutualFriends.slice(0, 3).map((f, i, arr) =>
              <span key={f.id}>
                    <strong className="font-semibold text-foreground">{f.full_name || "someone"}</strong>
                    {i < arr.length - 2 ? ", " : i === arr.length - 2 ? (mutualFriends.length > 3 ? ", " : " and ") : ""}
                  </span>
              )}
                {mutualFriends.length > 3 && <> and {mutualFriends.length - 3} {mutualFriends.length - 3 === 1 ? "other" : "others"}</>}
              </p>
            </div>
          }

          <div className={cn("mt-4 grid gap-2 sm:flex sm:max-w-md", isOwnProfile ? "grid-cols-2" : "grid-cols-[1fr_1fr_auto]")}>
            {isOwnProfile ?
            <>
                <Button onClick={() => navigate("/?story=1")} className="sm:flex-1 rounded-lg">
                  <Plus className="h-4 w-4 mr-1.5" /> Add to story
                </Button>
                <Button variant="secondary" onClick={() => setIsEditingProfile(true)} className="sm:flex-1 rounded-lg">
                  <Edit className="h-4 w-4 mr-1.5" /> Edit profile
                </Button>
              </> :
            <>
                <FriendshipButton currentUserId={currentUserId || ""} profileUserId={userId || ""} className="w-full sm:flex-1 rounded-lg" />
                <Button onClick={startMessage} className="sm:flex-1 rounded-lg">
                  <MessageCircle className="h-4 w-4 mr-1.5" /> Message
                </Button>
                {profileMenu(
                <Button variant="secondary" size="icon" className="rounded-lg" aria-label="More options">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                )}
              </>
            }
          </div>

          {/* Things in common (someone else's profile) */}
          {!isOwnProfile && thingsInCommon.length > 0 &&
          <section className="mt-4 rounded-xl border border-border p-3 sm:max-w-md" aria-label="Things in common">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold mb-1">
                <Users className="h-5 w-5" /> Things in common
              </h2>
              <p className="text-sm text-muted-foreground leading-snug">
                {thingsInCommon.map((t, i) =>
              <span key={t}>
                    {i > 0 && (i === thingsInCommon.length - 1 ? " and " : ", ")}
                    <strong className="font-semibold text-foreground">{t}</strong>
                  </span>
              )}
                {thingsInCommon.length === 1 ? " is" : " are"} something you share.
              </p>
            </section>
          }

          <div className="mt-3">
            <OnlineStatusIndicator userId={userId || ""} showText />
          </div>
        </header>

        {/* ─── Tabs: Facebook's pill chips (All, Photos, Videos …), sticky under the top bar ─── */}
        <nav aria-label="Profile sections" className="sticky top-0 md:top-[var(--nav-height)] z-30 mb-2 sm:mb-5 border-b border-border bg-card/95 sm:bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:supports-[backdrop-filter]:bg-background/80">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-3 sm:px-0 py-2">
            {(["posts", "photos", "videos", "albums", "qa"] as const).map((tab) => {
              const count = tab === "photos" ? photoPosts.length : tab === "videos" ? videoPosts.length : null;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  aria-current={activeTab === tab ? "page" : undefined}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-2 text-[15px] font-semibold transition-colors",
                    activeTab === tab ? "bg-primary/10 text-primary" : "text-foreground hover:bg-secondary"
                  )}>
                  {{ posts: "All", photos: "Photos", videos: "Videos", albums: "Albums", qa: "Q&A" }[tab]}
                  {count !== null && count > 0 && <span className="ml-1 font-normal opacity-60">{count}</span>}
                </button>
              );
            })}
          </div>
        </nav>

        {/* ─── Bento grid content ─── */}
        {activeTab === "posts" &&
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-5">
            {/* Left column — Info + Timeline */}
            <div className="lg:col-span-1 space-y-2 sm:space-y-5">
              {/* Personal details, as on Facebook: "Lives in Lagos", "From Ibadan", … */}
              {/* Only "Joined" isn't worth a card: others see nothing, you get a nudge to add details. */}
              {isOwnProfile && !hasDetails &&
            <section className="feed-section bento-card flex items-center gap-3 p-4 sm:p-5" aria-label="Add personal details">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">Tell people about yourself</p>
                    <p className="text-sm text-muted-foreground">Where you live, work and studied, so friends can find you.</p>
                  </div>
                  <Button size="sm" variant="secondary" className="shrink-0 rounded-full" onClick={() => setIsEditingProfile(true)}>Add details</Button>
                </section>
            }
              {hasDetails &&
            <section className="feed-section bento-card p-4 sm:p-5" aria-labelledby="personal-details">
                  <div className="flex items-center justify-between mb-3">
                    <h2 id="personal-details" className="text-[17px] font-bold">Personal details</h2>
                    {isOwnProfile &&
                <button type="button" onClick={() => setIsEditingProfile(true)} className="text-[15px] text-primary font-medium hover:underline">Edit</button>
                }
                  </div>
                  <ul className="space-y-3.5">
                    {infoItems.map((item) =>
                <li key={`${item.prefix ?? ""}${item.label}`} className="flex items-center gap-3 text-[15px]">
                        <item.icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        {item.href ?
                  <a href={item.href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                            {displayUrl(item.href)}
                          </a> :
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                            {item.prefix && <>{item.prefix} </>}
                            {item.prefix ? <strong className="font-semibold">{item.label}</strong> : item.label}
                          </span>
                  }
                      </li>
                )}
                  </ul>
                </section>
            }

              {/* Photos grid card */}
              {photoPosts.length > 0 &&
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.15 }}
              className="feed-section bento-card p-4 sm:p-5">
              
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[17px] font-bold">Photos</h3>
                    <button onClick={() => setActiveTab("photos")} className="text-xs text-primary font-medium hover:underline">
                      See All
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 rounded-xl overflow-hidden">
                    {photoPosts.slice(0, 9).map((p) =>
                <motion.button key={p.id} whileHover={{ scale: 1.05 }} onClick={() => navigate(`/post/${p.id}`)} className="aspect-square overflow-hidden rounded-lg" aria-label="Open photo post">
                        <img src={postImages(p)[0]} alt="" loading="lazy" className="w-full h-full object-cover" />
                      </motion.button>
                )}
                  </div>
                </motion.div>
            }

              {/* Achievements card */}

              {/* Mutual friends card */}
              {!isOwnProfile && mutualFriends.length > 0 &&
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.18 }}
              className="feed-section bento-card p-4 sm:p-5">
              
                  <h3 className="text-[17px] font-bold mb-3">
                    Mutual Friends · {mutualFriends.length}
                  </h3>
                  <div className="space-y-2.5">
                    {mutualFriends.slice(0, 6).map((friend) =>
                <div
                  key={friend.id}
                  onClick={() => navigate(`/profile/${friend.id}`)}
                  className="flex items-center gap-3 p-2 -mx-2 rounded-xl hover:bg-accent/10 cursor-pointer transition-colors">
                  
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={friend.avatar_url || undefined} />
                          <AvatarFallback className="gradient-brand-soft text-xs font-semibold">
                            {friend.full_name?.[0]?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium truncate">{friend.full_name || "User"}</span>
                      </div>
                )}
                    {mutualFriends.length > 6 &&
                <p className="text-xs text-muted-foreground text-center pt-1">
                        +{mutualFriends.length - 6} more
                      </p>
                }
                  </div>
                </motion.div>
            }

            </div>

            {/* Right column — Posts feed */}
            <div className="lg:col-span-2 space-y-2 sm:space-y-5">
              {posts.length === 0 ?
            <div className="bento-card p-12 text-center">
                  <div className="w-16 h-16 rounded-2xl gradient-brand-soft flex items-center justify-center mx-auto mb-4">
                    <MessageSquare className="h-7 w-7 text-primary" />
                  </div>
                  <p className="font-display font-semibold text-lg mb-1">No posts yet</p>
                  <p className="text-sm text-muted-foreground">
                    {isOwnProfile ? "Share your first thought with the world!" : "This user hasn't posted anything yet."}
                  </p>
                </div> :

            posts.map((post, i) =>
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: Math.min(i * 0.06, 0.3) }}>
              
                    <PostCard
                post={post}
                currentUserId={currentUserId || ""}
                reactions={reactionsData[post.id]?.reactions || {}}
                userReaction={reactionsData[post.id]?.userReaction || null}
                firstReactorName={reactionsData[post.id]?.firstReactor}
                comments={commentsData[post.id] || []}
                onReactionToggle={(type) => toggleReaction(post.id, type)}
                onCommentAdded={() => reloadComments(post.id)}
                onDelete={() => loadProfile()} />
              
                  </motion.div>
            )
            }
            </div>
          </div>
        }

        {activeTab === "videos" && (
        videoPosts.length === 0 ?
        <div className="bento-card p-12 text-center">
              <Play className="h-8 w-8 text-muted-foreground mx-auto mb-3" aria-hidden="true" />
              <p className="font-semibold text-lg mb-1">No videos</p>
              <p className="text-sm text-muted-foreground">Videos from posts will appear here.</p>
            </div> :
        // Portrait tiles, three across, like Facebook's Videos tab.
        <div className="grid grid-cols-3 gap-0.5 sm:gap-1 sm:rounded-xl overflow-hidden">
              {videoPosts.map((p) =>
          <button
            key={p.id}
            onClick={() => navigate(`/post/${p.id}`)}
            aria-label="Open video post"
            className="relative aspect-[9/16] overflow-hidden bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <video src={`${p.video_url}#t=0.1`} preload="metadata" muted playsInline className="w-full h-full object-cover" />
                  <Play className="absolute bottom-2 left-2 h-5 w-5 fill-white text-white drop-shadow" aria-hidden="true" />
                </button>
          )}
            </div>)
        }

        {activeTab === "photos" &&
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}>
          
            {photoPosts.length === 0 ?
          <div className="bento-card p-12 text-center">
                <div className="w-16 h-16 rounded-2xl gradient-brand-soft flex items-center justify-center mx-auto mb-4">
                  <ImageIcon className="h-7 w-7 text-primary" />
                </div>
                <p className="font-display font-semibold text-lg mb-1">No photos</p>
                <p className="text-sm text-muted-foreground">Photos from posts will appear here.</p>
              </div> :

          // Instagram-style grid: square tiles edge to edge; a stack icon marks posts with several photos.
          <div className="grid grid-cols-3 gap-0.5 sm:gap-1 sm:rounded-xl overflow-hidden">
                {photoPosts.map((p) => {
              const count = postImages(p).length;
              return (
                <button
                  key={p.id}
                  onClick={() => navigate(`/post/${p.id}`)}
                  aria-label={count > 1 ? `Open post with ${count} photos` : "Open photo post"}
                  className="group relative aspect-square overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                    <img src={postImages(p)[0]} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    {count > 1 && <Images className="absolute top-1.5 right-1.5 h-5 w-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" aria-hidden="true" />}
                  </button>);
            })}
              </div>
          }
          </motion.div>
        }

        {activeTab === "albums" &&
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}>
          
            {/* Album detail view */}
            {selectedAlbum ?
          <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedAlbum(null)} className="rounded-xl">
                      ← Back
                    </Button>
                    <div>
                      <h2 className="font-display font-bold text-xl">{selectedAlbum.name}</h2>
                      {selectedAlbum.description &&
                  <p className="text-sm text-muted-foreground">{selectedAlbum.description}</p>
                  }
                    </div>
                  </div>
                  {isOwnProfile &&
              <div className="flex gap-2">
                      <input
                  type="file"
                  aria-label="Add photo to album"
                  ref={photoInputRef}
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadPhotoToAlbum(selectedAlbum.id, file);
                    e.target.value = "";
                  }} />
                
                      <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isUploadingPhoto}>
                  
                        {isUploadingPhoto ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                        Add Photo
                      </Button>
                      <Button
                  size="sm"
                  variant="destructive"
                  className="rounded-xl"
                  onClick={() => setConfirm({ kind: "album", id: selectedAlbum.id })}
                  aria-label="Delete album">
                  
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
              }
                </div>

                {/* Find album photos from current state */}
                {(() => {
              const album = albums.find((a) => a.id === selectedAlbum.id);
              const photos = album?.photos || [];
              return photos.length === 0 ?
              <div className="bento-card p-12 text-center">
                      <div className="w-16 h-16 rounded-2xl gradient-brand-soft flex items-center justify-center mx-auto mb-4">
                        <ImageIcon className="h-7 w-7 text-primary" />
                      </div>
                      <p className="font-display font-semibold text-lg mb-1">No photos yet</p>
                      <p className="text-sm text-muted-foreground">Add photos to this album to get started.</p>
                    </div> :

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {photos.map((photo, i) =>
                <motion.div
                  key={photo.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...spring, delay: Math.min(i * 0.04, 0.3) }}
                  className="aspect-square rounded-2xl overflow-hidden bento-card relative group">
                  
                          <button className="w-full h-full" onClick={() => setViewPhoto(photo.image_url)} aria-label="View photo">
                            <img src={photo.image_url} alt={photo.caption || ""} loading="lazy" className="w-full h-full object-cover" />
                          </button>
                          {isOwnProfile &&
                  <button
                    onClick={() => setConfirm({ kind: "photo", id: photo.id })}
                    aria-label="Remove photo"
                    // Always visible on touch screens; on hover elsewhere.
                    className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1.5 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100">
                    
                              <X className="h-3 w-3" />
                            </button>
                  }
                        </motion.div>
                )}
                    </div>;

            })()}
              </div> : (

          /* Albums grid */
          <div>
                {isOwnProfile &&
            <div className="flex justify-end mb-4">
                    <Dialog open={createAlbumOpen} onOpenChange={setCreateAlbumOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="rounded-xl gradient-brand text-primary-foreground">
                          <Plus className="h-4 w-4 mr-2" /> New Album
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="glass border-border/50">
                        <DialogHeader>
                          <DialogTitle className="font-display">Create Album</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-3 pt-2">
                          <Input
                      placeholder="Album name"
                      value={newAlbumName}
                      onChange={(e) => setNewAlbumName(e.target.value)}
                      className="rounded-xl" />
                    
                          <Input
                      placeholder="Description (optional)"
                      value={newAlbumDesc}
                      onChange={(e) => setNewAlbumDesc(e.target.value)}
                      className="rounded-xl" />
                    
                          <Button
                      onClick={createAlbum}
                      disabled={!newAlbumName.trim() || isCreatingAlbum}
                      className="w-full rounded-xl gradient-brand text-primary-foreground">
                      
                            {isCreatingAlbum ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            Create
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
            }

                {albums.length === 0 ?
            <div className="bento-card p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl gradient-brand-soft flex items-center justify-center mx-auto mb-4">
                      <FolderOpen className="h-7 w-7 text-primary" />
                    </div>
                    <p className="font-display font-semibold text-lg mb-1">No albums</p>
                    <p className="text-sm text-muted-foreground">
                      {isOwnProfile ? "Create your first photo album!" : "This user hasn't created any albums yet."}
                    </p>
                  </div> :

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {albums.map((album, i) => {
                const coverPhoto = album.photos[0]?.image_url;
                return (
                  <motion.div
                    key={album.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ ...spring, delay: Math.min(i * 0.06, 0.3) }}
                    whileHover={{ scale: 1.02, y: -3 }}
                    onClick={() => setSelectedAlbum(album)}
                    className="bento-card overflow-hidden cursor-pointer group">
                    
                          <div className="aspect-[4/3] overflow-hidden relative">
                            {coverPhoto ?
                      <img src={coverPhoto} alt={album.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" /> :

                      <div className="w-full h-full gradient-brand-soft flex items-center justify-center">
                                <FolderOpen className="h-12 w-12 text-primary/40" />
                              </div>
                      }
                            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                            <div className="absolute bottom-0 left-0 right-0 p-4">
                              <h3 className="font-display font-bold text-foreground">{album.name}</h3>
                              <p className="text-xs text-muted-foreground">{album.photos.length} photo{album.photos.length !== 1 ? "s" : ""}</p>
                            </div>
                          </div>
                        </motion.div>);

              })}
                  </div>
            }
              </div>)
          }
          </motion.div>
        }
      {activeTab === "qa" && (
        <div className="max-w-2xl mx-auto space-y-6">
          {currentUserId && userId && (
            <CreatorSubscriptions
              creatorId={userId}
              currentUserId={currentUserId}
              isOwnProfile={isOwnProfile}
            />
          )}
          <AnonymousQA
            profileId={userId || ""}
            isOwnProfile={isOwnProfile}
            currentUserId={currentUserId}
          />
        </div>
      )}
      </div>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.kind === "album" ? "Delete this album?" : "Remove this photo?"}
        description={confirm?.kind === "album" ? "The album and all its photos will be removed." : "It will be removed from the album."}
        onConfirm={() => {
          if (confirm?.kind === "album") deleteAlbum(confirm.id);
          else if (confirm?.kind === "photo") deletePhoto(confirm.id);
          setConfirm(null);
        }}
      />

      <Dialog open={!!viewPhoto} onOpenChange={(open) => !open && setViewPhoto(null)}>
        <DialogContent className="max-w-3xl p-2 bg-black border-0">
          <DialogHeader className="sr-only"><DialogTitle>Photo</DialogTitle></DialogHeader>
          {viewPhoto && <img src={viewPhoto} alt="" className="w-full max-h-[80dvh] object-contain rounded-md" />}
        </DialogContent>
      </Dialog>

      {!isOwnProfile && currentUserId &&
      <>
          <ReportDialog reportedType="profile" reportedId={profile.id} currentUserId={currentUserId} open={reportOpen} onOpenChange={setReportOpen} />
          {features.blocking && <BlockDialog open={blockOpen} onOpenChange={setBlockOpen} userId={profile.id} name={profile.full_name} onBlocked={() => loadProfile()} />}
        </>
      }

      {profile &&
      <EditProfileModal
        profile={profile}
        isOpen={isEditingProfile}
        onClose={() => setIsEditingProfile(false)}
        onUpdate={loadProfile} />

      }
    </div>);

};

export default Profile;