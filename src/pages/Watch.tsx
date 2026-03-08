import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import WatchComments from "@/components/WatchComments";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Search, Plus, Play, ThumbsUp, Bookmark, BookmarkCheck, Share2,
  Eye, Clock, Filter, TrendingUp, Gamepad2, Users, Sparkles,
  Upload, X, Loader2, MoreHorizontal, Trash2
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

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

const Watch = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [videos, setVideos] = useState<WatchVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("for-you");
  const [searchQuery, setSearchQuery] = useState("");
  const [savedVideoIds, setSavedVideoIds] = useState<Set<string>>(new Set());
  const [likedVideoIds, setLikedVideoIds] = useState<Set<string>>(new Set());
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [friendIds, setFriendIds] = useState<string[]>([]);

  // Upload state
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadCategory, setUploadCategory] = useState("general");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (currentUserId) {
      loadVideos();
      loadSaves();
      loadLikes();
      loadFriends();
    }
  }, [currentUserId, activeCategory, searchQuery]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    setCurrentUserId(session.user.id);
  };

  const loadFriends = async () => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from("friendships")
      .select("user_id, friend_id")
      .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
      .eq("status", "accepted");
    setFriendIds(data?.map(f => f.user_id === currentUserId ? f.friend_id : f.user_id) || []);
  };

  const loadVideos = async () => {
    setIsLoading(true);
    let query = supabase
      .from("watch_videos")
      .select(`*, profiles:user_id (id, full_name, avatar_url)`);

    if (activeCategory === "saved") {
      const { data: saves } = await supabase
        .from("watch_saves")
        .select("video_id")
        .eq("user_id", currentUserId!);
      const savedIds = saves?.map(s => s.video_id) || [];
      if (savedIds.length === 0) { setVideos([]); setIsLoading(false); return; }
      query = query.in("id", savedIds);
    } else if (activeCategory === "following") {
      if (friendIds.length === 0) { setVideos([]); setIsLoading(false); return; }
      query = query.in("user_id", friendIds);
    } else if (activeCategory === "gaming") {
      query = query.eq("category", "gaming");
    } else if (activeCategory === "trending") {
      query = query.order("views_count", { ascending: false });
    }

    if (searchQuery.trim()) {
      query = query.ilike("title", `%${searchQuery.trim()}%`);
    }

    if (activeCategory !== "trending") {
      query = query.order("created_at", { ascending: false });
    }

    const { data, error } = await query.limit(50);
    if (error) {
      toast({ title: "Error loading videos", description: error.message, variant: "destructive" });
    } else {
      setVideos(data || []);
    }
    setIsLoading(false);
  };

  const loadSaves = async () => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from("watch_saves")
      .select("video_id")
      .eq("user_id", currentUserId);
    setSavedVideoIds(new Set(data?.map(s => s.video_id) || []));
  };

  const loadLikes = async () => {
    if (!currentUserId) return;
    const { data } = await supabase
      .from("watch_likes")
      .select("video_id")
      .eq("user_id", currentUserId);
    setLikedVideoIds(new Set(data?.map(l => l.video_id) || []));
  };

  const toggleSave = async (videoId: string) => {
    if (!currentUserId) return;
    const isSaved = savedVideoIds.has(videoId);

    if (isSaved) {
      await supabase.from("watch_saves").delete()
        .eq("user_id", currentUserId).eq("video_id", videoId);
      setSavedVideoIds(prev => { const n = new Set(prev); n.delete(videoId); return n; });
    } else {
      await supabase.from("watch_saves").insert({ user_id: currentUserId, video_id: videoId });
      setSavedVideoIds(prev => new Set(prev).add(videoId));
    }
  };

  const toggleLike = async (videoId: string) => {
    if (!currentUserId) return;
    const isLiked = likedVideoIds.has(videoId);

    if (isLiked) {
      await supabase.from("watch_likes").delete()
        .eq("user_id", currentUserId).eq("video_id", videoId);
      setLikedVideoIds(prev => { const n = new Set(prev); n.delete(videoId); return n; });
      setVideos(prev => prev.map(v => v.id === videoId ? { ...v, likes_count: Math.max(0, v.likes_count - 1) } : v));
    } else {
      await supabase.from("watch_likes").insert({ user_id: currentUserId, video_id: videoId });
      setLikedVideoIds(prev => new Set(prev).add(videoId));
      setVideos(prev => prev.map(v => v.id === videoId ? { ...v, likes_count: v.likes_count + 1 } : v));
    }
  };

  const incrementViews = async (videoId: string) => {
    await supabase.from("watch_videos").update({
      views_count: videos.find(v => v.id === videoId)!.views_count + 1,
    }).eq("id", videoId);
  };

  const handleUpload = async () => {
    if (!currentUserId || !uploadFile || !uploadTitle.trim()) return;
    if (uploadFile.size > 100 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 100MB", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    const ext = uploadFile.name.split(".").pop();
    const path = `${currentUserId}/${Date.now()}.${ext}`;

    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
    });

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("watch-videos")
      .upload(path, uploadFile, { contentType: uploadFile.type });

    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setIsUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("watch-videos").getPublicUrl(path);

    const { error: insertError } = await supabase.from("watch_videos").insert({
      user_id: currentUserId,
      title: uploadTitle.trim(),
      description: uploadDesc.trim() || null,
      video_url: urlData.publicUrl,
      category: uploadCategory,
    });

    if (insertError) {
      toast({ title: "Error", description: insertError.message, variant: "destructive" });
    } else {
      toast({ title: "Video uploaded!" });
      setShowUpload(false);
      setUploadTitle("");
      setUploadDesc("");
      setUploadFile(null);
      setUploadProgress(0);
      loadVideos();
    }
    setIsUploading(false);
  };

  const deleteVideo = async (videoId: string) => {
    await supabase.from("watch_videos").delete().eq("id", videoId);
    setVideos(prev => prev.filter(v => v.id !== videoId));
    toast({ title: "Video deleted" });
  };

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation currentUserId={currentUserId || undefined} />

      <div className="flex-1 pb-20 md:pb-0">
        <div className="max-w-[1400px] mx-auto px-2 sm:px-4 lg:px-6 py-4 sm:py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl sm:text-3xl font-bold font-display">Watch</h1>
            <Dialog open={showUpload} onOpenChange={setShowUpload}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" /> Upload Video
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Upload a Video</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Title *</Label>
                    <Input
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder="Give your video a title"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={uploadDesc}
                      onChange={(e) => setUploadDesc(e.target.value)}
                      placeholder="What's your video about?"
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={uploadCategory} onValueChange={setUploadCategory}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UPLOAD_CATEGORIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Video File *</Label>
                    <div className="mt-1">
                      {uploadFile ? (
                        <div className="flex items-center gap-2 p-3 bg-secondary rounded-lg">
                          <Play className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm truncate flex-1">{uploadFile.name}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setUploadFile(null)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center gap-2 p-6 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                          <Upload className="h-8 w-8 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Click to select video (max 100MB)</span>
                          <input
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                          />
                        </label>
                      )}
                    </div>
                  </div>
                  {isUploading && (
                    <div className="space-y-1">
                      <Progress value={uploadProgress} />
                      <p className="text-xs text-muted-foreground text-center">{uploadProgress}%</p>
                    </div>
                  )}
                  <Button
                    className="w-full"
                    onClick={handleUpload}
                    disabled={!uploadTitle.trim() || !uploadFile || isUploading}
                  >
                    {isUploading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Uploading...</> : "Upload Video"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search videos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200",
                  activeCategory === cat.id
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
              >
                <cat.icon className="h-4 w-4" />
                {cat.label}
              </button>
            ))}
          </div>

          {/* Video Grid */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
            <div className="text-center py-16">
              <Play className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
              <p className="text-lg font-medium text-muted-foreground">
                {activeCategory === "saved" ? "No saved videos yet" :
                 activeCategory === "following" ? "No videos from people you follow" :
                 searchQuery ? "No videos match your search" :
                 "No videos yet. Be the first to upload!"}
              </p>
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              initial="hidden"
              animate="visible"
              variants={{
                visible: { transition: { staggerChildren: 0.05 } },
              }}
            >
              <AnimatePresence>
                {videos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                    currentUserId={currentUserId!}
                    isPlaying={playingVideoId === video.id}
                    isSaved={savedVideoIds.has(video.id)}
                    isLiked={likedVideoIds.has(video.id)}
                    onPlay={() => {
                      setPlayingVideoId(playingVideoId === video.id ? null : video.id);
                      incrementViews(video.id);
                    }}
                    onToggleSave={() => toggleSave(video.id)}
                    onToggleLike={() => toggleLike(video.id)}
                    onDelete={() => deleteVideo(video.id)}
                    formatViews={formatViews}
                    formatDuration={formatDuration}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

interface VideoCardProps {
  video: WatchVideo;
  currentUserId: string;
  isPlaying: boolean;
  isSaved: boolean;
  isLiked: boolean;
  onPlay: () => void;
  onToggleSave: () => void;
  onToggleLike: () => void;
  onDelete: () => void;
  formatViews: (n: number) => string;
  formatDuration: (n: number | null) => string;
}

const VideoCard = ({
  video, currentUserId, isPlaying, isSaved, isLiked,
  onPlay, onToggleSave, onToggleLike, onDelete, formatViews, formatDuration,
}: VideoCardProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [isPlaying]);

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
      }}
    >
      <Card className="overflow-hidden group hover:shadow-lg transition-shadow duration-300">
        {/* Video / Thumbnail */}
        <div className="relative aspect-video bg-black cursor-pointer" onClick={onPlay}>
          {isPlaying ? (
            <video
              ref={videoRef}
              src={video.video_url}
              className="w-full h-full object-contain"
              controls
              autoPlay
            />
          ) : (
            <>
              {video.thumbnail_url ? (
                <img src={video.thumbnail_url} alt={video.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-secondary">
                  <Play className="h-12 w-12 text-muted-foreground/40" />
                </div>
              )}
              {/* Play overlay */}
              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="h-14 w-14 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
                  <Play className="h-6 w-6 text-primary-foreground ml-0.5" fill="currentColor" />
                </div>
              </div>
              {/* Duration badge */}
              {video.duration && (
                <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded font-mono">
                  {formatDuration(video.duration)}
                </span>
              )}
            </>
          )}
        </div>

        {/* Info */}
        <div className="p-3">
          <div className="flex gap-3">
            <Avatar className="h-9 w-9 flex-shrink-0">
              <AvatarImage src={video.profiles?.avatar_url || undefined} />
              <AvatarFallback className="text-xs">
                {video.profiles?.full_name?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm leading-snug line-clamp-2">{video.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {video.profiles?.full_name || "Unknown"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatViews(video.views_count)} views · {formatDistanceToNow(new Date(video.created_at), { addSuffix: true })}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onToggleSave}>
                  {isSaved ? <BookmarkCheck className="h-4 w-4 mr-2" /> : <Bookmark className="h-4 w-4 mr-2" />}
                  {isSaved ? "Remove from Watchlist" : "Save to Watchlist"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: video.title, url: window.location.href });
                  }
                }}>
                  <Share2 className="h-4 w-4 mr-2" /> Share
                </DropdownMenuItem>
                {video.user_id === currentUserId && (
                  <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-3 mt-3 pt-2 border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              className={cn("gap-1.5 h-8 text-xs", isLiked && "text-primary")}
              onClick={onToggleLike}
            >
              <ThumbsUp className={cn("h-3.5 w-3.5", isLiked && "fill-current")} />
              {video.likes_count > 0 && video.likes_count}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn("gap-1.5 h-8 text-xs", isSaved && "text-primary")}
              onClick={onToggleSave}
            >
              {isSaved ? <BookmarkCheck className="h-3.5 w-3.5 fill-current" /> : <Bookmark className="h-3.5 w-3.5" />}
              {isSaved ? "Saved" : "Save"}
            </Button>
            <div className="flex items-center gap-1 ml-auto text-xs text-muted-foreground">
              <Eye className="h-3.5 w-3.5" />
              {formatViews(video.views_count)}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

export default Watch;
