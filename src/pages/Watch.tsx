import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import WatchComments from "@/components/WatchComments";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, HeaderAction, PageSearch, Chips } from "@/components/layout/PageHeader";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Search, Plus, Play, ThumbsUp, Bookmark, BookmarkCheck, Share2,
  Eye, TrendingUp, Gamepad2, Users, Sparkles,
  Upload, X, Loader2, MoreHorizontal, Trash2,
} from "lucide-react";
import {
  ActionMenu, ActionMenuContent, ActionMenuItem, ActionMenuTrigger,
} from "@/components/ui/action-menu";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { readVideoInfo, storagePathFromUrl, uploadWithProgress } from "@/lib/storage-upload";

const CATEGORIES = [
  { id: "for-you", label: "For You", icon: Sparkles },
  { id: "trending", label: "Trending", icon: TrendingUp },
  { id: "gaming", label: "Gaming", icon: Gamepad2 },
  { id: "following", label: "Following", icon: Users },
  { id: "saved", label: "Saved", icon: Bookmark },
];

const UPLOAD_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "gaming", label: "Gaming" },
  { value: "music", label: "Music" },
  { value: "sports", label: "Sports" },
  { value: "education", label: "Education" },
  { value: "entertainment", label: "Entertainment" },
  { value: "news", label: "News" },
  { value: "tech", label: "Tech" },
];

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

interface WatchVideo {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  category: string;
  duration: number | null;
  views_count: number;
  likes_count: number;
  created_at: string;
  profiles?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

const formatDuration = (seconds: number | null) => {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const formatViews = (count: number) => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
};

const Watch = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  useSEO({ title: "Watch", description: "Watch videos on Ember." });
  const [searchParams, setSearchParams] = useSearchParams();
  const sharedVideoId = searchParams.get("v");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [videos, setVideos] = useState<WatchVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("for-you");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery.trim());
  const [savedVideoIds, setSavedVideoIds] = useState<Set<string>>(new Set());
  const [likedVideoIds, setLikedVideoIds] = useState<Set<string>>(new Set());
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [viewedVideoIds, setViewedVideoIds] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<WatchVideo | null>(null);

  // Upload state
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadCategory, setUploadCategory] = useState("general");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const checkAuth = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    setCurrentUserId(session.user.id);
  });

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const loadVideos = useEffectEvent(async (userId: string) => {
    setIsLoading(true);
    let query = supabase
      .from("watch_videos")
      .select(`*, profiles:user_id (id, full_name, avatar_url)`);

    if (activeCategory === "saved") {
      const { data: saves } = await supabase.from("watch_saves").select("video_id").eq("user_id", userId);
      const savedIds = saves?.map((s) => s.video_id) || [];
      if (savedIds.length === 0) { setVideos([]); setIsLoading(false); return; }
      query = query.in("id", savedIds);
    } else if (activeCategory === "following") {
      // Load friends here rather than in parallel, so the tab never shows "none" too early.
      const { data } = await supabase
        .from("friendships")
        .select("user_id, friend_id")
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
        .eq("status", "accepted");
      const friendIds = data?.map((f) => (f.user_id === userId ? f.friend_id : f.user_id)) || [];
      if (friendIds.length === 0) { setVideos([]); setIsLoading(false); return; }
      query = query.in("user_id", friendIds);
    } else if (activeCategory === "gaming") {
      query = query.eq("category", "gaming");
    } else if (activeCategory === "trending") {
      query = query.order("views_count", { ascending: false });
    }

    if (debouncedSearch) query = query.ilike("title", `%${debouncedSearch}%`);
    if (activeCategory !== "trending") query = query.order("created_at", { ascending: false });

    const { data, error } = await query.limit(50);
    if (error) {
      toast({ title: "Couldn't load videos", description: error.message, variant: "destructive" });
      setIsLoading(false);
      return;
    }
    const list = data || [];

    // Like counts come from the likes themselves: the stored counter is never updated.
    const [{ data: likes }, { data: saves }] = await Promise.all([
      list.length
        ? supabase.from("watch_likes").select("video_id, user_id").in("video_id", list.map((v) => v.id))
        : Promise.resolve({ data: [] as { video_id: string; user_id: string }[] }),
      supabase.from("watch_saves").select("video_id").eq("user_id", userId),
    ]);
    const counts = new Map<string, number>();
    const mine = new Set<string>();
    for (const l of likes ?? []) {
      counts.set(l.video_id, (counts.get(l.video_id) ?? 0) + 1);
      if (l.user_id === userId) mine.add(l.video_id);
    }
    setVideos(list.map((v) => ({ ...v, likes_count: counts.get(v.id) ?? 0 })));
    setLikedVideoIds(mine);
    setSavedVideoIds(new Set(saves?.map((s) => s.video_id) || []));
    setIsLoading(false);
  });

  useEffect(() => {
    if (currentUserId) loadVideos(currentUserId);
  }, [currentUserId, activeCategory, debouncedSearch, loadVideos]);

  // A shared link (/watch?v=<id>): scroll to that video and start it.
  const openSharedVideo = useEffectEvent(() => {
    if (!sharedVideoId || isLoading) return;
    if (!videos.some((v) => v.id === sharedVideoId)) return;
    setPlayingVideoId(sharedVideoId);
    incrementViews(sharedVideoId);
    requestAnimationFrame(() =>
      document.getElementById(`video-${sharedVideoId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
  });
  useEffect(() => {
    openSharedVideo();
  }, [sharedVideoId, isLoading, openSharedVideo]);

  const toggleSave = async (videoId: string) => {
    if (!currentUserId) return;
    const wasSaved = savedVideoIds.has(videoId);
    const apply = (saved: boolean) =>
      setSavedVideoIds((prev) => {
        const n = new Set(prev);
        if (saved) n.add(videoId); else n.delete(videoId);
        return n;
      });
    apply(!wasSaved);
    const { error } = wasSaved
      ? await supabase.from("watch_saves").delete().eq("user_id", currentUserId).eq("video_id", videoId)
      : await supabase.from("watch_saves").insert({ user_id: currentUserId, video_id: videoId });
    if (error) {
      apply(wasSaved);
      toast({ title: "Couldn't update your watchlist", variant: "destructive" });
    } else if (activeCategory === "saved" && wasSaved) {
      setVideos((prev) => prev.filter((v) => v.id !== videoId));
    }
  };

  const toggleLike = async (videoId: string) => {
    if (!currentUserId) return;
    const wasLiked = likedVideoIds.has(videoId);
    const apply = (liked: boolean) => {
      setLikedVideoIds((prev) => {
        const n = new Set(prev);
        if (liked) n.add(videoId); else n.delete(videoId);
        return n;
      });
      setVideos((prev) => prev.map((v) =>
        v.id === videoId ? { ...v, likes_count: Math.max(0, v.likes_count + (liked ? 1 : -1)) } : v
      ));
    };
    apply(!wasLiked);
    const { error } = wasLiked
      ? await supabase.from("watch_likes").delete().eq("user_id", currentUserId).eq("video_id", videoId)
      : await supabase.from("watch_likes").insert({ user_id: currentUserId, video_id: videoId });
    if (error) {
      apply(wasLiked);
      toast({ title: "Couldn't save your like", variant: "destructive" });
    }
  };

  const incrementViews = async (videoId: string) => {
    if (!currentUserId) return;
    const video = videos.find((v) => v.id === videoId);
    // Don't count views on your own videos, or twice in one visit.
    if (!video || video.user_id === currentUserId || viewedVideoIds.has(videoId)) return;
    setViewedVideoIds((prev) => new Set(prev).add(videoId));
    setVideos((prev) => prev.map((v) => (v.id === videoId ? { ...v, views_count: v.views_count + 1 } : v)));
    await supabase.rpc("increment_watch_views", { _video_id: videoId, _user_id: currentUserId });
  };

  const shareVideo = async (video: WatchVideo) => {
    const url = `${window.location.origin}/watch?v=${video.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: video.title, url });
        return;
      } catch {
        // Cancelled: fall back to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Paste it anywhere to share this video." });
    } catch {
      toast({ title: "Couldn't copy the link", description: url });
    }
  };

  const pickFile = (file: File | null) => {
    if (file && file.size > MAX_UPLOAD_BYTES) {
      toast({ title: "That video is too large", description: "Videos can be up to 100 MB.", variant: "destructive" });
      return;
    }
    setUploadFile(file);
    if (file && !uploadTitle.trim()) setUploadTitle(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  };

  const handleUpload = async () => {
    if (!currentUserId || !uploadFile || !uploadTitle.trim()) return;
    setIsUploading(true);
    setUploadProgress(0);
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ext = uploadFile.name.split(".").pop()?.toLowerCase() || "mp4";

    try {
      const [{ duration, thumbnail }, videoUrl] = await Promise.all([
        readVideoInfo(uploadFile),
        uploadWithProgress("watch-videos", `${currentUserId}/${stamp}.${ext}`, uploadFile, setUploadProgress),
      ]);
      let thumbnailUrl: string | null = null;
      if (thumbnail) {
        thumbnailUrl = await uploadWithProgress("watch-videos", `${currentUserId}/${stamp}-thumb.jpg`, thumbnail).catch(() => null);
      }

      const { error } = await supabase.from("watch_videos").insert({
        user_id: currentUserId,
        title: uploadTitle.trim(),
        description: uploadDesc.trim() || null,
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        duration,
        category: uploadCategory,
      });
      if (error) throw error;

      toast({ title: "Video uploaded!" });
      setShowUpload(false);
      setUploadTitle("");
      setUploadDesc("");
      setUploadFile(null);
      loadVideos(currentUserId);
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const deleteVideo = async (video: WatchVideo) => {
    setPendingDelete(null);
    const { error } = await supabase.from("watch_videos").delete().eq("id", video.id);
    if (error) {
      toast({ title: "Couldn't delete the video", description: error.message, variant: "destructive" });
      return;
    }
    // Remove the files too, so they don't keep using storage.
    const paths = [video.video_url, video.thumbnail_url]
      .map((u) => (u ? storagePathFromUrl("watch-videos", u) : null))
      .filter((p): p is string => !!p);
    if (paths.length) supabase.storage.from("watch-videos").remove(paths);
    setVideos((prev) => prev.filter((v) => v.id !== video.id));
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation currentUserId={currentUserId || undefined} />

      <div className="flex-1">
        <div className="page-flush max-w-[1400px] mx-auto px-0 sm:px-4 lg:px-6 pb-6 sm:py-6">
            <Dialog open={showUpload} onOpenChange={(open) => !isUploading && setShowUpload(open)}>
              <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Upload a video</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label htmlFor="watch-file">Video file *</Label>
                    <div className="mt-1">
                      {uploadFile ? (
                        <div className="flex items-center gap-2 p-3 bg-secondary rounded-lg">
                          <Play className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm truncate flex-1">{uploadFile.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{(uploadFile.size / 1024 / 1024).toFixed(1)} MB</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setUploadFile(null)} disabled={isUploading} aria-label="Remove file">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <label htmlFor="watch-file" className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                          <Upload className="h-8 w-8 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Choose a video (up to 100 MB)</span>
                          <input id="watch-file" type="file" accept="video/*" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] || null)} />
                        </label>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="watch-title">Title *</Label>
                    <Input id="watch-title" value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="Give your video a title" className="mt-1" maxLength={120} />
                  </div>
                  <div>
                    <Label htmlFor="watch-desc">Description</Label>
                    <Textarea id="watch-desc" value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} placeholder="What's your video about?" className="mt-1" rows={3} />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={uploadCategory} onValueChange={setUploadCategory}>
                      <SelectTrigger className="mt-1" aria-label="Category">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UPLOAD_CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {isUploading && (
                    <div className="space-y-1" aria-live="polite">
                      <Progress value={uploadProgress} />
                      <p className="text-xs text-muted-foreground text-center">
                        {uploadProgress < 100 ? `Uploading… ${uploadProgress}%` : "Finishing up…"}
                      </p>
                    </div>
                  )}
                  <Button className="w-full" onClick={handleUpload} disabled={!uploadTitle.trim() || !uploadFile || isUploading}>
                    {isUploading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Uploading…</> : "Upload video"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

          <PageHeader
            title="Watch"
            actions={<HeaderAction icon={Plus} label="Upload video" primary onClick={() => setShowUpload(true)} />}
            className="sm:mb-4"
          >
            <PageSearch value={searchQuery} onChange={setSearchQuery} placeholder="Search videos" />
            <Chips
              label="Category"
              value={activeCategory}
              onChange={setActiveCategory}
              options={CATEGORIES.map((c) => ({ value: c.id, label: c.label, icon: c.icon }))}
            />
          </PageHeader>

          {/* Video Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 mt-2 sm:mt-0">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-video w-full" />
                  <div className="p-3 space-y-2">
                    <div className="flex gap-3">
                      <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-2/3" />
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Play className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">
                {activeCategory === "saved" ? "No saved videos yet" :
                 activeCategory === "following" ? "No videos from your friends yet" :
                 debouncedSearch ? "No videos match your search" :
                 "No videos yet. Be the first to upload!"}
              </p>
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
            >
              <AnimatePresence>
                {videos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    currentUserId={currentUserId!}
                    isPlaying={playingVideoId === video.id}
                    isHighlighted={sharedVideoId === video.id}
                    isSaved={savedVideoIds.has(video.id)}
                    isLiked={likedVideoIds.has(video.id)}
                    onPlay={() => {
                      setPlayingVideoId(video.id);
                      incrementViews(video.id);
                    }}
                    onToggleSave={() => toggleSave(video.id)}
                    onToggleLike={() => toggleLike(video.id)}
                    onShare={() => shareVideo(video)}
                    onDelete={() => setPendingDelete(video)}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this video?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.title}" and its likes and comments will be removed for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDelete && deleteVideo(pendingDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {sharedVideoId && !isLoading && !videos.some((v) => v.id === sharedVideoId) && activeCategory === "for-you" && !debouncedSearch && (
        <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-40 rounded-full bg-card border shadow-lg px-4 py-2 text-sm flex items-center gap-2">
          That video isn't available anymore.
          <button className="text-primary font-medium" onClick={() => setSearchParams({}, { replace: true })}>OK</button>
        </div>
      )}
    </div>
  );
};

interface VideoCardProps {
  video: WatchVideo;
  currentUserId: string;
  isPlaying: boolean;
  isHighlighted: boolean;
  isSaved: boolean;
  isLiked: boolean;
  onPlay: () => void;
  onToggleSave: () => void;
  onToggleLike: () => void;
  onShare: () => void;
  onDelete: () => void;
}

const VideoCard = ({
  video, currentUserId, isPlaying, isHighlighted, isSaved, isLiked,
  onPlay, onToggleSave, onToggleLike, onShare, onDelete,
}: VideoCardProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isPlaying) el.play().catch(() => {});
    else el.pause();
  }, [isPlaying]);

  return (
    <motion.div
      id={`video-${video.id}`}
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
      }}
    >
      <Card className={cn("feed-section overflow-hidden group hover:shadow-lg transition-shadow duration-300", isHighlighted && "ring-2 ring-primary")}>
        {/* Video / Thumbnail */}
        <div className="relative aspect-video bg-black">
          {isPlaying ? (
            // The player's own controls work normally: nothing here closes it.
            <video ref={videoRef} src={video.video_url} className="w-full h-full object-contain" controls autoPlay playsInline />
          ) : (
            <button
              type="button"
              onClick={onPlay}
              className="absolute inset-0 w-full h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
              aria-label={`Play ${video.title}`}
            >
              {video.thumbnail_url ? (
                <img src={video.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                // No thumbnail stored: show an early frame of the video itself.
                <video src={`${video.video_url}#t=0.5`} preload="metadata" muted playsInline className="w-full h-full object-cover pointer-events-none" />
              )}
              {/* Always visible on touch screens; on hover elsewhere */}
              <span className="absolute inset-0 bg-black/20 flex items-center justify-center transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100">
                <span className="h-14 w-14 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
                  <Play className="h-6 w-6 text-primary-foreground ml-0.5" fill="currentColor" />
                </span>
              </span>
              {video.duration ? (
                <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded font-mono">
                  {formatDuration(video.duration)}
                </span>
              ) : null}
            </button>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          <div className="flex gap-3">
            <Avatar className="h-9 w-9 flex-shrink-0">
              <AvatarImage src={video.profiles?.avatar_url || undefined} alt="" />
              <AvatarFallback className="text-xs">
                {video.profiles?.full_name?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm leading-snug line-clamp-2">{video.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {video.profiles?.full_name || "Unknown"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatViews(video.views_count)} {video.views_count === 1 ? "view" : "views"} · {formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}
              </p>
            </div>
            <ActionMenu>
              <ActionMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" aria-label="More options">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </ActionMenuTrigger>
              <ActionMenuContent align="end">
                <ActionMenuItem onSelect={onToggleSave}>
                  {isSaved ? <BookmarkCheck className="h-4 w-4 mr-2" /> : <Bookmark className="h-4 w-4 mr-2" />}
                  {isSaved ? "Remove from watchlist" : "Save to watchlist"}
                </ActionMenuItem>
                <ActionMenuItem onSelect={onShare}>
                  <Share2 className="h-4 w-4 mr-2" /> Share
                </ActionMenuItem>
                {video.user_id === currentUserId && (
                  <ActionMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </ActionMenuItem>
                )}
              </ActionMenuContent>
            </ActionMenu>
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-1 sm:gap-3 mt-3 pt-2 border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              className={cn("gap-1.5 h-8 text-xs", isLiked && "text-primary")}
              onClick={onToggleLike}
              aria-pressed={isLiked}
              aria-label={isLiked ? "Unlike" : "Like"}
            >
              <ThumbsUp className={cn("h-3.5 w-3.5", isLiked && "fill-current")} />
              {video.likes_count > 0 && video.likes_count}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn("gap-1.5 h-8 text-xs", isSaved && "text-primary")}
              onClick={onToggleSave}
              aria-pressed={isSaved}
            >
              {isSaved ? <BookmarkCheck className="h-3.5 w-3.5 fill-current" /> : <Bookmark className="h-3.5 w-3.5" />}
              {isSaved ? "Saved" : "Save"}
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 h-8 text-xs" onClick={onShare}>
              <Share2 className="h-3.5 w-3.5" /> Share
            </Button>
            <div className="flex items-center gap-1 ml-auto text-xs text-muted-foreground" aria-label={`${video.views_count} views`}>
              <Eye className="h-3.5 w-3.5" />
              {formatViews(video.views_count)}
            </div>
          </div>
        </div>

        {/* Comments */}
        <WatchComments videoId={video.id} currentUserId={currentUserId} />
      </Card>
    </motion.div>
  );
};

export default Watch;
