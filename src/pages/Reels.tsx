import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Plus, Send, Film, ChevronUp, ChevronDown, ArrowLeft, Home, MessageCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import VideoUpload from "@/components/VideoUpload";
// Navigation removed - Reels uses its own minimal top bar
import ReelCard from "@/components/ReelCard";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AvatarImage } from "@/components/ui/avatar";

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
  profiles: { full_name: string | null; avatar_url: string | null };
  reel_likes: { user_id: string }[];
  reel_comments: Array<{
    id: string; content: string; user_id: string; created_at: string;
    profiles: { full_name: string | null; avatar_url: string | null };
  }>;
}

export default function Reels() {
  const navigate = useNavigate();
  const { reelId: paramReelId } = useParams();
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setUser(session.user);
      loadFriendIds(session.user.id);
    };
    init();
    loadReels();
  }, []);

  const loadFriendIds = async (userId: string) => {
    const { data } = await supabase
      .from("friendships")
      .select("user_id, friend_id, status")
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
    const accepted = new Set<string>();
    const pending = new Set<string>();
    data?.forEach(f => {
      const otherId = f.user_id === userId ? f.friend_id : f.user_id;
      if (f.status === "accepted") accepted.add(otherId);
      else if (f.status === "pending") pending.add(otherId);
    });
    setFriendIds(accepted);
    setPendingIds(pending);
  };

  const handleFollow = async (targetUserId: string) => {
    if (!user) return;
    const isFriend = friendIds.has(targetUserId);
    const isPending = pendingIds.has(targetUserId);
    if (isFriend) {
      await supabase.from("friendships").delete()
        .or(`and(user_id.eq.${user.id},friend_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},friend_id.eq.${user.id})`);
      setFriendIds(prev => { const n = new Set(prev); n.delete(targetUserId); return n; });
      toast({ title: "Unfriended" });
    } else if (isPending) {
      // Cancel pending request
      await supabase.from("friendships").delete()
        .or(`and(user_id.eq.${user.id},friend_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},friend_id.eq.${user.id})`);
      setPendingIds(prev => { const n = new Set(prev); n.delete(targetUserId); return n; });
      toast({ title: "Request cancelled" });
    } else {
      const { error } = await supabase.from("friendships").insert({ user_id: user.id, friend_id: targetUserId, status: "pending" });
      if (!error) {
        setPendingIds(prev => new Set(prev).add(targetUserId));
        toast({ title: "Friend request sent!" });
      }
    }
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
      if (data && data.length > 0) {
        // If opened via shared link, start on that reel
        const targetId = paramReelId && data.find(r => r.id === paramReelId) ? paramReelId : data[0].id;
        setActiveReelId(targetId);
        // Scroll to the target reel after render
        if (paramReelId && targetId === paramReelId) {
          const idx = data.findIndex(r => r.id === paramReelId);
          if (idx > 0) {
            setTimeout(() => {
              containerRef.current?.scrollTo({ top: idx * (containerRef.current?.clientHeight || 0) });
            }, 100);
          }
        }
      }
    }
    setLoading(false);
  };

  const handleLike = async (reelId: string) => {
    if (!user) return;
    const reel = reels.find(r => r.id === reelId);
    if (!reel) return;
    const hasLiked = reel.reel_likes.some(l => l.user_id === user.id);
    setReels(prev => prev.map(r => r.id === reelId
      ? { ...r, reel_likes: hasLiked ? r.reel_likes.filter(l => l.user_id !== user.id) : [...r.reel_likes, { user_id: user.id }] }
      : r
    ));
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
    try {
      await navigator.share?.({ url: `${window.location.origin}/reels/${reelId}` });
    } catch {
      await navigator.clipboard.writeText(`${window.location.origin}/reels/${reelId}`);
      toast({ title: "Link copied!" });
    }
  };

  const handleUpload = async () => {
    if (!user || !uploadVideoUrl) return;
    const { error } = await supabase.from("reels").insert({ user_id: user.id, video_url: uploadVideoUrl, caption: uploadCaption });
    if (error) { toast({ title: "Error uploading reel", variant: "destructive" }); }
    else { toast({ title: "Reel uploaded!" }); setShowUpload(false); setUploadCaption(""); setUploadVideoUrl(""); loadReels(); }
  };

  const handleDeleteReel = async (reelId: string) => {
    const { error } = await supabase.from("reels").delete().eq("id", reelId);
    if (error) { toast({ title: "Error deleting reel", variant: "destructive" }); }
    else { toast({ title: "Reel deleted" }); setReels(prev => prev.filter(r => r.id !== reelId)); }
  };

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, clientHeight } = containerRef.current;
    const index = Math.round(scrollTop / clientHeight);
    if (reels[index] && reels[index].id !== activeReelId) setActiveReelId(reels[index].id);
  };

  const scroll = (dir: number) => {
    if (!containerRef.current) return;
    containerRef.current.scrollBy({ top: dir * containerRef.current.clientHeight, behavior: "smooth" });
  };

  const activeReel = reels.find(r => r.id === activeReelId);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Desktop top bar for Reels (no floating dock on this page) */}
      <div className="hidden md:flex items-center justify-between px-6 py-3 bg-black/80 backdrop-blur-md border-b border-white/10 z-30">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-white/70 hover:text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-white font-bold text-lg">Reels</h1>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/")} className="text-white/70 hover:text-white transition-colors flex items-center gap-1.5 text-sm">
            <Home className="h-4 w-4" /> Home
          </button>
          <button onClick={() => navigate("/messages")} className="text-white/70 hover:text-white transition-colors flex items-center gap-1.5 text-sm">
            <MessageCircle className="h-4 w-4" /> Messages
          </button>
          <button onClick={() => setShowUpload(true)} className="text-white/70 hover:text-white transition-colors flex items-center gap-1.5 text-sm">
            <Plus className="h-5 w-5" /> Create
          </button>
        </div>
      </div>

      <div className="md:hidden absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent safe-area-top">
        <h1 className="text-white font-bold text-xl">Reels</h1>
        <button onClick={() => setShowUpload(true)} className="text-white"><Plus className="h-6 w-6" /></button>
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
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="h-[calc(100vh-56px)] md:h-[calc(100vh-56px)] w-full md:w-auto overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
          >
            {reels.map((reel) => (
              <ReelCard
                key={reel.id}
                reel={reel}
                isActive={reel.id === activeReelId}
                isMuted={isMuted}
                currentUserId={user?.id || null}
                onToggleMute={() => setIsMuted(p => !p)}
                onLike={handleLike}
                onComment={(id) => { setActiveReelId(id); setShowComments(true); }}
                onShare={handleShare}
                onDelete={handleDeleteReel}
                onShowUpload={() => setShowUpload(true)}
                onVideoError={(id) => {
                  if (id === activeReelId) toast({ title: "Video couldn't play", description: "Re-upload from your device.", variant: "destructive" });
                }}
                onNavigateToProfile={(userId) => navigate(`/profile/${userId}`)}
                onFollow={handleFollow}
                isFollowing={friendIds.has(reel.user_id)}
                isPending={pendingIds.has(reel.user_id)}
              />
            ))}
          </div>

          <div className="hidden md:flex flex-col gap-2 absolute right-8 top-1/2 -translate-y-1/2 z-20">
            <button onClick={() => scroll(-1)} className="h-12 w-12 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center shadow-lg transition-colors">
              <ChevronUp className="h-6 w-6" />
            </button>
            <button onClick={() => scroll(1)} className="h-12 w-12 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center shadow-lg transition-colors">
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
              <Input placeholder="Add a comment..." value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleComment()} className="flex-1" />
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
