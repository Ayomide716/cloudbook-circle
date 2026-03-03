import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThumbsUp, MessageCircle, Share2, Plus, Music, Send, Volume2, VolumeX, Play, Trash2, Film, ChevronUp, ChevronDown, MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import VideoUpload from "@/components/VideoUpload";
import Navigation from "@/components/Navigation";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Reel {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  created_at: string;
  user_id: string;
  views_count: number;
  likes_count: number;
  shares_count: number;
  profiles: {
    full_name: string | null;
    avatar_url: string | null;
  };
  reel_likes: { user_id: string }[];
  reel_comments: Array<{
    id: string;
    content: string;
    user_id: string;
    created_at: string;
    profiles: {
      full_name: string | null;
      avatar_url: string | null;
    };
  }>;
}

export default function Reels() {
  const navigate = useNavigate();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();
  const [activeReelId, setActiveReelId] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadVideoUrl, setUploadVideoUrl] = useState("");
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState<Record<string, boolean>>({});
  const [doubleTapHeart, setDoubleTapHeart] = useState<string | null>(null);
  const lastTapRef = useRef<{ time: number; reelId: string | null }>({ time: 0, reelId: null });
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  useEffect(() => {
    checkAuth();
    loadReels();
  }, []);

  useEffect(() => {
    videoRefs.current.forEach((video, id) => {
      video.muted = isMuted;
      if (id === activeReelId) {
        video.play().catch(() => {});
        setIsPaused((prev) => ({ ...prev, [id]: false }));
      } else {
        video.pause();
      }
    });
  }, [activeReelId, isMuted]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    setUser(session.user);
  };

  const loadReels = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reels")
      .select(`*, profiles (full_name, avatar_url), reel_likes (user_id), reel_comments (id, content, user_id, created_at, profiles (full_name, avatar_url))`)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error loading reels", variant: "destructive" });
    } else {
      setReels(data || []);
      if (data && data.length > 0) setActiveReelId(data[0].id);
    }
    setLoading(false);
  };

  const handleLike = async (reelId: string) => {
    if (!user) return;
    const reel = reels.find(r => r.id === reelId);
    if (!reel) return;
    const hasLiked = reel.reel_likes.some((like) => like.user_id === user.id);
    setReels(prev => prev.map(r => {
      if (r.id === reelId) {
        return { ...r, reel_likes: hasLiked ? r.reel_likes.filter(l => l.user_id !== user.id) : [...r.reel_likes, { user_id: user.id }] };
      }
      return r;
    }));
    if (hasLiked) {
      await supabase.from("reel_likes").delete().eq("reel_id", reelId).eq("user_id", user.id);
    } else {
      await supabase.from("reel_likes").insert({ reel_id: reelId, user_id: user.id });
    }
  };

  const handleComment = async () => {
    if (!user || !commentText.trim() || !activeReelId) return;
    const { data, error } = await supabase.from("reel_comments").insert({
      reel_id: activeReelId, user_id: user.id, content: commentText,
    }).select(`*, profiles (full_name, avatar_url)`).single();
    if (error) {
      toast({ title: "Error posting comment", variant: "destructive" });
    } else if (data) {
      setReels(prev => prev.map(r => r.id === activeReelId ? { ...r, reel_comments: [...r.reel_comments, data] } : r));
      setCommentText("");
    }
  };

  const handleShare = async (reelId: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/reels/${reelId}`);
    toast({ title: "Link copied!" });
  };

  const handleUpload = async () => {
    if (!user || !uploadVideoUrl) return;
    const { error } = await supabase.from("reels").insert({ user_id: user.id, video_url: uploadVideoUrl, caption: uploadCaption });
    if (error) { toast({ title: "Error uploading reel", variant: "destructive" }); }
    else { toast({ title: "Reel uploaded!" }); setShowUpload(false); setUploadCaption(""); setUploadVideoUrl(""); loadReels(); }
  };

  const togglePlayPause = (reelId: string) => {
    const video = videoRefs.current.get(reelId);
    if (!video) return;
    if (video.paused) { video.play().catch(() => {}); setIsPaused(p => ({ ...p, [reelId]: false })); }
    else { video.pause(); setIsPaused(p => ({ ...p, [reelId]: true })); }
  };

  const handleDoubleTap = useCallback((reelId: string) => {
    const now = Date.now();
    if (now - lastTapRef.current.time < 300 && lastTapRef.current.reelId === reelId) {
      const reel = reels.find(r => r.id === reelId);
      if (reel && user && !reel.reel_likes.some(l => l.user_id === user.id)) handleLike(reelId);
      setDoubleTapHeart(reelId);
      setTimeout(() => setDoubleTapHeart(null), 800);
    } else {
      togglePlayPause(reelId);
    }
    lastTapRef.current = { time: now, reelId };
  }, [reels, user]);

  const handleDeleteReel = async (reelId: string) => {
    const { error } = await supabase.from("reels").delete().eq("id", reelId);
    if (error) { toast({ title: "Error deleting reel", variant: "destructive" }); }
    else { toast({ title: "Reel deleted" }); setReels(prev => prev.filter(r => r.id !== reelId)); }
  };

  const handleScroll = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const height = container.clientHeight;
    const index = Math.round(scrollTop / height);
    if (reels[index] && reels[index].id !== activeReelId) setActiveReelId(reels[index].id);
  };

  const scrollToNext = () => {
    if (!containerRef.current) return;
    const h = containerRef.current.clientHeight;
    containerRef.current.scrollBy({ top: h, behavior: "smooth" });
  };

  const scrollToPrev = () => {
    if (!containerRef.current) return;
    const h = containerRef.current.clientHeight;
    containerRef.current.scrollBy({ top: -h, behavior: "smooth" });
  };

  const activeReel = reels.find(r => r.id === activeReelId);
  const formatCount = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Use the main Navigation on desktop */}
      <div className="hidden md:block">
        <Navigation currentUserId={user?.id} />
      </div>

      {/* Mobile header */}
      <div className="md:hidden absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent safe-area-top">
        <h1 className="text-white font-bold text-xl">Reels</h1>
        <button onClick={() => setShowUpload(true)} className="text-white">
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {reels.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-white">
          <Film className="h-16 w-16 mb-4 opacity-50" />
          <p className="text-lg mb-4">No reels yet</p>
          <Button onClick={() => setShowUpload(true)} variant="secondary">
            <Plus className="h-4 w-4 mr-2" /> Create First Reel
          </Button>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center relative">
          {/* Main reel container - centered like Facebook */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="h-[calc(100vh-56px)] md:h-[calc(100vh-56px)] w-full md:w-auto overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
          >
            {reels.map((reel) => {
              const isLiked = reel.reel_likes.some(l => l.user_id === user?.id);
              const isTikTokLink = /tiktok\.com|vt\.tiktok\.com/i.test(reel.video_url);
              const isPublicStorageUrl = reel.video_url.includes("/storage/v1/object/public/");
              const canPlayInline = !isTikTokLink && isPublicStorageUrl;

              return (
                <div key={reel.id} className="h-[calc(100vh-56px)] md:h-[calc(100vh-56px)] snap-start flex items-center justify-center relative">
                  <div className="relative h-full w-full md:w-[400px] md:max-h-[calc(100vh-80px)] md:rounded-xl md:overflow-hidden md:mx-auto">
                    {/* Video */}
                    {canPlayInline ? (
                      <>
                        <video
                          ref={(el) => { if (el) videoRefs.current.set(reel.id, el); }}
                          src={reel.video_url}
                          className="absolute inset-0 w-full h-full object-cover"
                          loop playsInline muted={isMuted} preload="metadata"
                          onError={() => {
                            if (reel.id === activeReelId) toast({ title: "Video couldn't play", description: "Re-upload from your device.", variant: "destructive" });
                          }}
                          onClick={() => handleDoubleTap(reel.id)}
                        />

                        {doubleTapHeart === reel.id && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                            <ThumbsUp className="h-24 w-24 text-white fill-white animate-like-heart drop-shadow-2xl" />
                          </div>
                        )}

                        {isPaused[reel.id] && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10" onClick={() => handleDoubleTap(reel.id)}>
                            <div className="h-16 w-16 rounded-full bg-black/50 flex items-center justify-center">
                              <Play className="h-8 w-8 text-white ml-1" />
                            </div>
                          </div>
                        )}

                        {/* Mute button */}
                        <button onClick={() => setIsMuted(p => !p)} className="absolute top-4 right-4 z-20 h-9 w-9 rounded-full bg-black/40 flex items-center justify-center md:top-4">
                          {isMuted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
                        </button>

                        {user?.id === reel.user_id && (
                          <button onClick={() => handleDeleteReel(reel.id)} className="absolute top-4 left-4 z-20 h-9 w-9 rounded-full bg-black/40 flex items-center justify-center">
                            <Trash2 className="h-4 w-4 text-white" />
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-black">
                        <div className="mx-6 max-w-md rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
                          <p className="text-white font-semibold">Video can't play</p>
                          <p className="mt-1 text-sm text-white/70">Upload a video file instead of a link.</p>
                          <Button variant="secondary" className="mt-3" onClick={() => setShowUpload(true)}>Upload a reel video</Button>
                          {user?.id === reel.user_id && (
                            <Button variant="destructive" className="mt-2 w-full" onClick={() => handleDeleteReel(reel.id)}>
                              <Trash2 className="h-4 w-4 mr-2" /> Delete this reel
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Bottom gradient */}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70 pointer-events-none" />

                    {/* Bottom info - user, caption */}
                    <div className="absolute left-4 right-16 bottom-6 z-10 md:bottom-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Avatar className="h-9 w-9 border-2 border-white">
                          <AvatarImage src={reel.profiles.avatar_url || ""} />
                          <AvatarFallback className="bg-primary text-primary-foreground text-xs">{reel.profiles.full_name?.[0] || "U"}</AvatarFallback>
                        </Avatar>
                        <span className="text-white font-semibold text-sm">{reel.profiles.full_name || "User"}</span>
                        <span className="text-white/60 text-sm">· Follow</span>
                      </div>
                      {reel.caption && (
                        <p className="text-white/90 text-sm line-clamp-2 drop-shadow-lg">{reel.caption}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Music className="h-3 w-3 text-white" />
                        <p className="text-white/70 text-xs">{reel.profiles.full_name} · Original audio</p>
                      </div>
                    </div>
                  </div>

                  {/* Side action buttons */}
                  <div className="absolute right-3 bottom-20 md:right-[calc(50%-230px)] md:bottom-auto md:top-1/2 md:-translate-y-1/2 flex flex-col items-center gap-5 z-30">
                    {/* Like */}
                    <button onClick={() => handleLike(reel.id)} className="flex flex-col items-center">
                      <div className={cn("h-11 w-11 rounded-full flex items-center justify-center", isLiked ? "bg-primary/20" : "bg-black/40 md:bg-secondary")}>
                        <ThumbsUp className={cn("h-6 w-6", isLiked ? "fill-primary text-primary" : "text-white md:text-foreground")} />
                      </div>
                      <span className="text-white md:text-foreground text-xs mt-1 font-medium">{formatCount(reel.reel_likes.length)}</span>
                    </button>

                    {/* Comment */}
                    <button onClick={() => { setActiveReelId(reel.id); setShowComments(true); }} className="flex flex-col items-center">
                      <div className="h-11 w-11 rounded-full bg-black/40 md:bg-secondary flex items-center justify-center">
                        <MessageCircle className="h-6 w-6 text-white md:text-foreground" />
                      </div>
                      <span className="text-white md:text-foreground text-xs mt-1 font-medium">{formatCount(reel.reel_comments.length)}</span>
                    </button>

                    {/* Share */}
                    <button onClick={() => handleShare(reel.id)} className="flex flex-col items-center">
                      <div className="h-11 w-11 rounded-full bg-black/40 md:bg-secondary flex items-center justify-center">
                        <Share2 className="h-6 w-6 text-white md:text-foreground" />
                      </div>
                      <span className="text-white md:text-foreground text-xs mt-1 font-medium">Share</span>
                    </button>

                    {/* More */}
                    <button className="flex flex-col items-center">
                      <div className="h-11 w-11 rounded-full bg-black/40 md:bg-secondary flex items-center justify-center">
                        <MoreHorizontal className="h-6 w-6 text-white md:text-foreground" />
                      </div>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop scroll nav arrows */}
          <div className="hidden md:flex flex-col gap-2 absolute right-8 top-1/2 -translate-y-1/2 z-20">
            <button onClick={scrollToPrev} className="h-12 w-12 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center shadow-lg transition-colors">
              <ChevronUp className="h-6 w-6" />
            </button>
            <button onClick={scrollToNext} className="h-12 w-12 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center shadow-lg transition-colors">
              <ChevronDown className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      {/* Comments Sheet */}
      <Sheet open={showComments} onOpenChange={setShowComments}>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl">
          <SheetHeader className="border-b pb-3">
            <SheetTitle className="text-center">{activeReel?.reel_comments.length || 0} Comments</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto py-4 space-y-4 max-h-[calc(70vh-140px)]">
            {activeReel?.reel_comments.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No comments yet. Be the first!</p>
            ) : (
              activeReel?.reel_comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={comment.profiles.avatar_url || ""} />
                    <AvatarFallback>{comment.profiles.full_name?.[0] || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{comment.profiles.full_name || "User"}</p>
                    <p className="text-sm text-foreground/80">{comment.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-card border-t">
            <div className="flex gap-2">
              <Avatar className="h-8 w-8"><AvatarFallback>You</AvatarFallback></Avatar>
              <Input placeholder="Add a comment..." value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyPress={(e) => e.key === "Enter" && handleComment()} className="flex-1" />
              <Button size="icon" onClick={handleComment} disabled={!commentText.trim()}><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create Reel</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Video</label>
              <div className="mt-2 flex items-center justify-between rounded-lg border p-3">
                <p className="text-sm text-muted-foreground">{uploadVideoUrl ? "Video selected" : "Upload from your device"}</p>
                <VideoUpload bucket="post-videos" userId={user?.id} currentVideo={uploadVideoUrl} onUploadComplete={setUploadVideoUrl} label="" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Caption</label>
              <Textarea placeholder="Write something fun..." value={uploadCaption} onChange={(e) => setUploadCaption(e.target.value)} className="mt-1" rows={3} />
            </div>
            <Button onClick={handleUpload} className="w-full" disabled={!uploadVideoUrl}>Post Reel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
