import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Heart, MessageCircle, Share2, Plus, Music, Send, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import VideoUpload from "@/components/VideoUpload";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  useEffect(() => {
    checkAuth();
    loadReels();
  }, []);

  useEffect(() => {
    // Auto-play the active reel, pause others
    videoRefs.current.forEach((video, id) => {
      if (id === activeReelId) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [activeReelId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setUser(session.user);
  };

  const loadReels = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reels")
      .select(`
        *,
        profiles (full_name, avatar_url),
        reel_likes (user_id),
        reel_comments (
          id,
          content,
          user_id,
          created_at,
          profiles (full_name, avatar_url)
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading reels", variant: "destructive" });
    } else {
      setReels(data || []);
      if (data && data.length > 0) {
        setActiveReelId(data[0].id);
      }
    }
    setLoading(false);
  };

  const handleLike = async (reelId: string) => {
    if (!user) return;
    const reel = reels.find(r => r.id === reelId);
    if (!reel) return;

    const hasLiked = reel.reel_likes.some((like) => like.user_id === user.id);

    // Optimistic update
    setReels(prev => prev.map(r => {
      if (r.id === reelId) {
        return {
          ...r,
          reel_likes: hasLiked
            ? r.reel_likes.filter(l => l.user_id !== user.id)
            : [...r.reel_likes, { user_id: user.id }]
        };
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
      reel_id: activeReelId,
      user_id: user.id,
      content: commentText,
    }).select(`*, profiles (full_name, avatar_url)`).single();

    if (error) {
      toast({ title: "Error posting comment", variant: "destructive" });
    } else if (data) {
      setReels(prev => prev.map(r => {
        if (r.id === activeReelId) {
          return { ...r, reel_comments: [...r.reel_comments, data] };
        }
        return r;
      }));
      setCommentText("");
    }
  };

  const handleShare = async (reelId: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/reels/${reelId}`);
    toast({ title: "Link copied!" });
  };

  const handleUpload = async () => {
    if (!user || !uploadVideoUrl) return;

    const { error } = await supabase.from("reels").insert({
      user_id: user.id,
      video_url: uploadVideoUrl,
      caption: uploadCaption,
    });

    if (error) {
      toast({ title: "Error uploading reel", variant: "destructive" });
    } else {
      toast({ title: "Reel uploaded!" });
      setShowUpload(false);
      setUploadCaption("");
      setUploadVideoUrl("");
      loadReels();
    }
  };

  const handleScroll = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const scrollTop = container.scrollTop;
    const height = container.clientHeight;
    const index = Math.round(scrollTop / height);
    if (reels[index] && reels[index].id !== activeReelId) {
      setActiveReelId(reels[index].id);
    }
  };

  const activeReel = reels.find(r => r.id === activeReelId);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
        <button onClick={() => navigate(-1)} className="text-white">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="text-white font-semibold text-lg">Reels</h1>
        <button onClick={() => setShowUpload(true)} className="text-white">
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {reels.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-white">
          <Film className="h-16 w-16 mb-4 opacity-50" />
          <p className="text-lg mb-4">No reels yet</p>
          <Button onClick={() => setShowUpload(true)} variant="secondary">
            <Plus className="h-4 w-4 mr-2" />
            Create First Reel
          </Button>
        </div>
      ) : (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        >
          {reels.map((reel) => {
            const isLiked = reel.reel_likes.some(l => l.user_id === user?.id);
              return (
                <div key={reel.id} className="h-full w-full snap-start relative">
                  {/* Video */}
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current.set(reel.id, el);
                    }}
                    src={reel.video_url}
                    className="absolute inset-0 w-full h-full object-cover"
                    loop
                    playsInline
                    muted
                    controls
                    preload="metadata"
                    onError={() => {
                      console.log("Reel video failed to load:", reel.video_url);
                      toast({
                        title: "Video couldn't play",
                        description: "The video failed to load. Please try uploading again.",
                        variant: "destructive",
                      });
                    }}
                    onClick={(e) => {
                      const video = e.currentTarget;
                      video.paused ? video.play() : video.pause();
                    }}
                  />

                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70 pointer-events-none" />

                {/* Right side actions */}
                <div className="absolute right-3 bottom-32 flex flex-col items-center gap-5">
                  {/* Profile */}
                  <button
                    onClick={() => navigate(`/profile/${reel.user_id}`)}
                    className="relative"
                  >
                    <Avatar className="h-12 w-12 border-2 border-white">
                      <AvatarImage src={reel.profiles.avatar_url || ""} />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {reel.profiles.full_name?.[0] || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary rounded-full p-0.5">
                      <Plus className="h-3 w-3 text-white" />
                    </div>
                  </button>

                  {/* Like */}
                  <button
                    onClick={() => handleLike(reel.id)}
                    className="flex flex-col items-center"
                  >
                    <div className={cn(
                      "p-2 rounded-full transition-all",
                      isLiked ? "bg-red-500/20" : "bg-white/10"
                    )}>
                      <Heart className={cn(
                        "h-7 w-7 transition-all",
                        isLiked ? "fill-red-500 text-red-500 scale-110" : "text-white"
                      )} />
                    </div>
                    <span className="text-white text-xs mt-1 font-medium">
                      {reel.reel_likes.length}
                    </span>
                  </button>

                  {/* Comment */}
                  <button
                    onClick={() => {
                      setActiveReelId(reel.id);
                      setShowComments(true);
                    }}
                    className="flex flex-col items-center"
                  >
                    <div className="p-2 rounded-full bg-white/10">
                      <MessageCircle className="h-7 w-7 text-white" />
                    </div>
                    <span className="text-white text-xs mt-1 font-medium">
                      {reel.reel_comments.length}
                    </span>
                  </button>

                  {/* Share */}
                  <button
                    onClick={() => handleShare(reel.id)}
                    className="flex flex-col items-center"
                  >
                    <div className="p-2 rounded-full bg-white/10">
                      <Share2 className="h-7 w-7 text-white" />
                    </div>
                    <span className="text-white text-xs mt-1 font-medium">Share</span>
                  </button>

                  {/* Music disc */}
                  <div className="mt-2">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-r from-gray-800 to-gray-600 border-2 border-gray-500 flex items-center justify-center animate-spin-slow">
                      <Music className="h-4 w-4 text-white" />
                    </div>
                  </div>
                </div>

                {/* Bottom info */}
                <div className="absolute left-4 right-20 bottom-20">
                  <p className="text-white font-semibold text-base mb-1">
                    @{reel.profiles.full_name || "user"}
                  </p>
                  {reel.caption && (
                    <p className="text-white/90 text-sm line-clamp-2">
                      {reel.caption}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Music className="h-3 w-3 text-white" />
                    <p className="text-white/80 text-xs">Original audio</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Comments Sheet */}
      <Sheet open={showComments} onOpenChange={setShowComments}>
        <SheetContent side="bottom" className="h-[70vh] rounded-t-3xl">
          <SheetHeader className="border-b pb-3">
            <SheetTitle className="text-center">
              {activeReel?.reel_comments.length || 0} Comments
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto py-4 space-y-4 max-h-[calc(70vh-140px)]">
            {activeReel?.reel_comments.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No comments yet. Be the first!
              </p>
            ) : (
              activeReel?.reel_comments.map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={comment.profiles.avatar_url || ""} />
                    <AvatarFallback>
                      {comment.profiles.full_name?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">
                      {comment.profiles.full_name || "User"}
                    </p>
                    <p className="text-sm text-foreground/80">{comment.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-card border-t">
            <div className="flex gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>You</AvatarFallback>
              </Avatar>
              <Input
                placeholder="Add a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleComment()}
                className="flex-1"
              />
              <Button size="icon" onClick={handleComment} disabled={!commentText.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Reel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Video</label>
              <div className="mt-2 flex items-center justify-between rounded-lg border p-3">
                <p className="text-sm text-muted-foreground">
                  {uploadVideoUrl ? "Video selected" : "Upload from your device"}
                </p>
                <VideoUpload
                  bucket="post-videos"
                  userId={user?.id}
                  currentVideo={uploadVideoUrl}
                  onUploadComplete={setUploadVideoUrl}
                  label=""
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Caption</label>
              <Textarea
                placeholder="Write something fun..."
                value={uploadCaption}
                onChange={(e) => setUploadCaption(e.target.value)}
                className="mt-1"
                rows={3}
              />
            </div>
            <Button onClick={handleUpload} className="w-full" disabled={!uploadVideoUrl}>
              Post Reel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Add to make the music icon spin animation
const Film = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M7 3v18" />
    <path d="M3 7.5h4" />
    <path d="M3 12h18" />
    <path d="M3 16.5h4" />
    <path d="M17 3v18" />
    <path d="M17 7.5h4" />
    <path d="M17 16.5h4" />
  </svg>
);
