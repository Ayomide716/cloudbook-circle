import { useEffect, useState, useRef } from "react";
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
  Camera,
  CalendarDays,
  Heart,
  MessageSquare,
  Image as ImageIcon,
  Users,
  Plus,
  FolderOpen,
  Trash2,
  X,
  Loader2 } from
"lucide-react";
import ImageUpload from "@/components/ImageUpload";
import VerifiedBadge from "@/components/VerifiedBadge";
import ProfileSkeleton from "@/components/skeletons/ProfileSkeleton";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { cn, getErrorMessage, toDate } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import ProfileAchievements from "@/components/ProfileAchievements";
import AnonymousQA from "@/components/AnonymousQA";
import CreatorSubscriptions from "@/components/CreatorSubscriptions";
import type { PostComment } from "@/components/PostCard";
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
  is_verified?: boolean;
  created_at?: string | null;
}

interface Post {
  id: string;
  content: string;
  image_url: string | null;
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
  useSEO({ title: "Profile", description: "View user profile on CloudBook." });
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [reactionsData, setReactionsData] = useState<Record<string, {reactions: Record<string, number>;userReaction: string | null;}>>({});
  const [commentsData, setCommentsData] = useState<Record<string, PostComment[]>>({});
  const [friendCount, setFriendCount] = useState(0);
  const [activeTab, setActiveTab] = useState<"posts" | "about" | "photos" | "albums" | "qa">("posts");

  // Albums state
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [newAlbumDesc, setNewAlbumDesc] = useState("");
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [createAlbumOpen, setCreateAlbumOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Mutual friends state
  const [mutualFriends, setMutualFriends] = useState<{id: string;full_name: string | null;avatar_url: string | null;}[]>([]);

  const coverRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const coverY = useTransform(scrollY, [0, 300], [0, 100]);
  const coverScale = useTransform(scrollY, [0, 300], [1, 1.15]);
  const headerOpacity = useTransform(scrollY, [150, 250], [0, 1]);

  const checkAuth = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {navigate("/auth");return;}
    setCurrentUserId(session.user.id);
  });

  useEffect(() => {
    checkAuth();
  }, [navigate, checkAuth]);

  const loadProfile = useEffectEvent(async () => {
    if (!userId) return;
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

    // Load friend count
    const { count } = await supabase.
    from("friendships").
    select("*", { count: "exact", head: true }).
    eq("status", "accepted").
    or(`user_id.eq.${userId},friend_id.eq.${userId}`);
    setFriendCount(count || 0);

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
    // Load mutual friends
    loadMutualFriends();
    setIsLoading(false);
  });

  useEffect(() => {
    if (userId) loadProfile();
  }, [userId, loadProfile]);

  const loadMutualFriends = async () => {
    if (!currentUserId || !userId || currentUserId === userId) {
      setMutualFriends([]);
      return;
    }
    // Get my friends
    const { data: myFriends } = await supabase.
    from("friendships").
    select("user_id, friend_id").
    eq("status", "accepted").
    or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);

    const myFriendIds = new Set(
      (myFriends || []).map((f) => f.user_id === currentUserId ? f.friend_id : f.user_id)
    );

    // Get their friends
    const { data: theirFriends } = await supabase.
    from("friendships").
    select("user_id, friend_id").
    eq("status", "accepted").
    or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    const theirFriendIds = new Set(
      (theirFriends || []).map((f) => f.user_id === userId ? f.friend_id : f.user_id)
    );

    // Intersection
    const mutualIds = [...myFriendIds].filter((id) => theirFriendIds.has(id));
    if (mutualIds.length === 0) {setMutualFriends([]);return;}

    const { data: profiles } = await supabase.
    from("profiles").
    select("id, full_name, avatar_url").
    in("id", mutualIds.slice(0, 20));

    setMutualFriends(profiles || []);
  };

  const loadAlbums = async () => {
    if (!userId) return;
    const { data: albumsData } = await supabase.
    from("albums").
    select("*").
    eq("user_id", userId).
    order("created_at", { ascending: false });

    if (albumsData) {
      const albumsWithPhotos: Album[] = [];
      for (const album of albumsData) {
        const { data: photos } = await supabase.
        from("album_photos").
        select("*").
        eq("album_id", album.id).
        order("created_at", { ascending: false });
        albumsWithPhotos.push({ ...album, photos: photos || [] });
      }
      setAlbums(albumsWithPhotos);
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
      toast({ title: "Album created!" });
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
      toast({ title: "Album deleted" });
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
      toast({ title: "Photo added!" });
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
      toast({ title: "Photo removed" });
      loadAlbums();
    }
  };

  const loadPostsData = async (postsData: Post[]) => {
    if (!currentUserId || postsData.length === 0) return;
    const postIds = postsData.map((p) => p.id);

    const [{ data: rData }, { data: cData }] = await Promise.all([
    supabase.from("reactions").select("post_id, user_id, reaction_type").in("post_id", postIds),
    supabase.from("comments").select(`*, profiles:user_id (id, full_name, avatar_url)`).in("post_id", postIds).order("created_at", { ascending: true })]
    );

    const reactionsMap: Record<string, {reactions: Record<string, number>;userReaction: string | null;}> = {};
    const commentsMap: Record<string, PostComment[]> = {};
    postIds.forEach((id) => {
      const pr = rData?.filter((r) => r.post_id === id) || [];
      const rc: Record<string, number> = {};
      pr.forEach((r) => {rc[r.reaction_type] = (rc[r.reaction_type] || 0) + 1;});
      reactionsMap[id] = { reactions: rc, userReaction: pr.find((r) => r.user_id === currentUserId)?.reaction_type || null };
      commentsMap[id] = cData?.filter((c) => c.post_id === id) || [];
    });
    setReactionsData(reactionsMap);
    setCommentsData(commentsMap);
  };

  const handleAvatarUpload = async (url: string) => {
    if (!profile) return;
    const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
    if (error) {toast({ title: "Error", description: error.message, variant: "destructive" });return;}
    setProfile({ ...profile, avatar_url: url });
    toast({ title: "Avatar updated" });
  };

  const handleCoverUpload = async (url: string) => {
    if (!profile) return;
    const { error } = await supabase.from("profiles").update({ cover_url: url }).eq("id", profile.id);
    if (error) {toast({ title: "Error", description: error.message, variant: "destructive" });return;}
    setProfile({ ...profile, cover_url: url });
    toast({ title: "Cover photo updated" });
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
  const photoPosts = posts.filter((p) => p.image_url);

  // Build activity timeline
  const timelineItems = posts.slice(0, 8).map((p) => ({
    id: p.id,
    type: p.image_url ? "photo" : p.video_url ? "video" : "post",
    content: p.content.substring(0, 80) + (p.content.length > 80 ? "…" : ""),
    date: p.created_at,
    image: p.image_url
  }));

  const infoItems = [
  profile.work && { icon: Briefcase, label: profile.work },
  profile.education && { icon: GraduationCap, label: profile.education },
  profile.location && { icon: MapPin, label: profile.location },
  profile.website && { icon: LinkIcon, label: profile.website, isLink: true }].
  filter(Boolean) as {icon: LucideIcon;label: string;isLink?: boolean;}[];

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={currentUserId || undefined} />

      {/* Sticky mini-header on scroll */}
      <motion.div
        style={{ opacity: headerOpacity }}
        className="fixed top-[var(--nav-height)] inset-x-0 z-40 glass border-b border-border px-6 py-2 flex items-center gap-3">
        
        <Avatar className="h-8 w-8">
          <AvatarImage src={profile.avatar_url || undefined} />
          <AvatarFallback className="text-xs">{profile.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
        </Avatar>
        <span className="font-display font-semibold text-sm truncate">
          {profile.full_name || "Anonymous"}
        </span>
        {profile.is_verified && <VerifiedBadge size="sm" />}
      </motion.div>

      {/* ─── Parallax Cover ─── */}
      <div ref={coverRef} className="relative h-56 sm:h-72 overflow-hidden">
        <motion.div
          style={{ y: coverY, scale: coverScale }}
          className="absolute inset-0">
          
          {profile.cover_url ?
          <img src={profile.cover_url} alt="Cover" className="w-full h-full object-cover" /> :

          <div className="w-full h-full gradient-brand opacity-80" />
          }
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
        </motion.div>
        {isOwnProfile &&
        <div className="absolute inset-x-0 top-3 z-10 max-w-5xl mx-auto px-3 sm:px-6 flex justify-end">
            <ImageUpload
            bucket="avatars"
            userId={currentUserId!}
            onUploadComplete={handleCoverUpload}
            label="Edit cover"
            variant="pill" />
          
          </div>
        }
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-6 -mt-12 sm:-mt-20 relative z-10">
        {/* ─── Profile header card ─── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="bento-card overflow-hidden mb-5">
          
          {/* Top section with avatar and actions */}
          <div className="relative px-5 sm:px-8 pt-4 pb-5">
            <div className="flex items-end gap-4 sm:gap-6">
              {/* Avatar */}
              <div className="relative -mt-14 sm:-mt-18 flex-shrink-0">
                <motion.div whileHover={{ scale: 1.04 }} transition={spring}>
                  <Avatar className="h-24 w-24 sm:h-36 sm:w-36 border-4 sm:border-[5px] border-card shadow-lg">
                    <AvatarImage src={profile.avatar_url || undefined} />
                    <AvatarFallback className="text-3xl sm:text-4xl font-display gradient-brand text-primary-foreground">
                      {profile.full_name?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </motion.div>
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
                <div className="absolute bottom-2 right-2">
                    <OnlineStatusIndicator userId={userId || ""} />
                  </div>
                }
              </div>

              {/* Name + actions inline */}
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <h1 className="text-xl sm:text-2xl font-display font-bold truncate inline-flex items-center gap-2">
                      {profile.full_name || "Anonymous User"}
                      {profile.is_verified && <VerifiedBadge size="lg" />}
                    </h1>
                    <div className="flex items-center gap-1 mt-0.5">
                      <OnlineStatusIndicator userId={userId || ""} showText />
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    {isOwnProfile ?
                    <Button variant="outline" size="sm" onClick={() => setIsEditingProfile(true)} className="rounded-xl">
                        <Edit className="h-4 w-4 mr-2" /> Edit Profile
                      </Button> :

                    <div className="flex flex-wrap gap-2">
                        <FriendshipButton currentUserId={currentUserId || ""} profileUserId={userId || ""} />
                        <Button variant="outline" size="sm" onClick={startMessage} className="rounded-xl" aria-label="Message">
                          <MessageCircle className="h-4 w-4 sm:mr-2" />
                          <span className="hidden sm:inline">Message</span>
                        </Button>
                      </div>
                    }
                  </div>
                </div>
              </div>
            </div>

            {/* Bio */}
            {profile.bio &&
            <p className="text-muted-foreground mt-4 max-w-2xl text-sm leading-relaxed">{profile.bio}</p>
            }
          </div>

          {/* Stats bar */}
          <div className="border-t border-border">
            <div className="grid grid-cols-3">
              {[
              { value: posts.length, label: "Posts" },
              { value: friendCount, label: "Friends" },
              { value: photoPosts.length, label: "Photos" }].
              map((s) =>
              <motion.button
                key={s.label}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                onClick={() => s.label === "Photos" ? setActiveTab("photos") : s.label === "Friends" ? navigate("/friends") : setActiveTab("posts")}
                className="flex flex-col items-center justify-center gap-0.5 py-4 cursor-pointer hover:bg-accent/60 transition-colors first:rounded-bl-2xl last:rounded-br-2xl">
                  <span className="font-display font-bold text-xl">{s.value}</span>
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </motion.button>
              )}
            </div>
          </div>
        </motion.div>

        {/* ─── Tab bar ─── */}
        <div className="flex gap-1 p-1 rounded-xl bg-muted/50 mb-6">
          {(["posts", "about", "photos", "albums", "qa"] as const).map((tab) =>
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 py-2.5 rounded-lg text-sm font-medium transition-all capitalize",
              activeTab === tab ?
              "bg-card text-foreground shadow-sm" :
              "text-muted-foreground hover:text-foreground"
            )}>
            
              {tab === "qa" ? "Q&A" : tab}
            </button>
          )}
        </div>

        {/* ─── Bento grid content ─── */}
        {activeTab === "posts" &&
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left column — Info + Timeline */}
            <div className="lg:col-span-1 space-y-5">
              {/* About card */}
              {infoItems.length > 0 &&
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.1 }}
              className="bento-card p-5">
              
                  <h3 className="font-display font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wider">About</h3>
                  <div className="space-y-3">
                    {infoItems.map((item, i) =>
                <div key={i} className="flex items-center gap-3 text-sm">
                        <div className="w-8 h-8 rounded-lg gradient-brand-soft flex items-center justify-center flex-shrink-0">
                          <item.icon className="h-4 w-4 text-primary" />
                        </div>
                        {item.isLink ?
                  <a href={item.label} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                            {item.label}
                          </a> :

                  <span className="truncate">{item.label}</span>
                  }
                      </div>
                )}
                  </div>
                </motion.div>
            }

              {/* Photos grid card */}
              {photoPosts.length > 0 &&
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.15 }}
              className="bento-card p-5">
              
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">Photos</h3>
                    <button onClick={() => setActiveTab("photos")} className="text-xs text-primary font-medium hover:underline">
                      See All
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 rounded-xl overflow-hidden">
                    {photoPosts.slice(0, 9).map((p) =>
                <motion.div key={p.id} whileHover={{ scale: 1.05 }} className="aspect-square overflow-hidden rounded-lg">
                        <img src={p.image_url!} alt="" className="w-full h-full object-cover" />
                      </motion.div>
                )}
                  </div>
                </motion.div>
            }

              {/* Achievements card */}
              <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.12 }}
              className="bento-card p-5">
              
                <ProfileAchievements userId={userId || ""} isOwnProfile={isOwnProfile} />
              </motion.div>

              {/* Mutual friends card */}
              {!isOwnProfile && mutualFriends.length > 0 &&
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.18 }}
              className="bento-card p-5">
              
                  <h3 className="font-display font-semibold mb-3 text-sm text-muted-foreground uppercase tracking-wider">
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

              {/* Activity timeline card */}
              {timelineItems.length > 0 &&
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.2 }}
              className="bento-card p-5">
              
                  <h3 className="font-display font-semibold mb-4 text-sm text-muted-foreground uppercase tracking-wider">Activity</h3>
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-border" />
                    <div className="space-y-4">
                      {timelineItems.map((item, i) =>
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...spring, delay: 0.05 * i }}
                    className="flex gap-3 relative">
                    
                          <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 relative z-10",
                      item.type === "photo" ? "bg-gold/15" : "bg-primary/10"
                    )}>
                            {item.type === "photo" ?
                      <ImageIcon className="h-3.5 w-3.5 text-gold" /> :

                      <MessageSquare className="h-3.5 w-3.5 text-primary" />
                      }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{item.content}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {formatDistanceToNow(toDate(item.date), { addSuffix: true })}
                            </p>
                          </div>
                        </motion.div>
                  )}
                    </div>
                  </div>
                </motion.div>
            }
            </div>

            {/* Right column — Posts feed */}
            <div className="lg:col-span-2 space-y-5">
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
                comments={commentsData[post.id] || []}
                onReactionToggle={() => loadProfile()}
                onCommentAdded={() => loadProfile()}
                onDelete={() => loadProfile()} />
              
                  </motion.div>
            )
            }
            </div>
          </div>
        }

        {activeTab === "about" &&
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="max-w-2xl mx-auto">
          
            <div className="bento-card p-6 space-y-5">
              <h2 className="font-display font-bold text-xl">About {profile.full_name?.split(" ")[0] || "this user"}</h2>
              {profile.bio && <p className="text-muted-foreground leading-relaxed">{profile.bio}</p>}

              {infoItems.length > 0 &&
            <div className="space-y-4 pt-2">
                  {infoItems.map((item, i) =>
              <div key={i} className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl gradient-brand-soft flex items-center justify-center">
                        <item.icon className="h-5 w-5 text-primary" />
                      </div>
                      {item.isLink ?
                <a href={item.label} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {item.label}
                        </a> :

                <span>{item.label}</span>
                }
                    </div>
              )}
                </div>
            }

              {profile.created_at &&
            <div className="flex items-center gap-4 pt-2 border-t border-border">
                  <div className="w-10 h-10 rounded-xl gradient-brand-soft flex items-center justify-center">
                    <CalendarDays className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Joined {formatDistanceToNow(new Date(profile.created_at), { addSuffix: true })}
                  </span>
                </div>
            }

              {infoItems.length === 0 && !profile.bio &&
            <p className="text-muted-foreground text-center py-8">No info to display yet.</p>
            }
            </div>
          </motion.div>
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

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {photoPosts.map((p, i) =>
            <motion.div
              key={p.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...spring, delay: Math.min(i * 0.04, 0.3) }}
              whileHover={{ scale: 1.03, y: -2 }}
              className="aspect-square rounded-2xl overflow-hidden cursor-pointer bento-card">
              
                    <img src={p.image_url!} alt="" className="w-full h-full object-cover" />
                  </motion.div>
            )}
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
                  onClick={() => deleteAlbum(selectedAlbum.id)}>
                  
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
                  
                          <img src={photo.image_url} alt={photo.caption || ""} className="w-full h-full object-cover" />
                          {isOwnProfile &&
                  <button
                    onClick={() => deletePhoto(photo.id)}
                    className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    
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
        <div className="max-w-2xl space-y-6">
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