import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useSEO } from "@/hooks/useSEO";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { User } from "@supabase/supabase-js";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { Plus, Send, Film, ChevronUp, ChevronDown, ArrowLeft, Home, MessageCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import VideoUpload from "@/components/VideoUpload";
// Navigation removed - Reels uses its own minimal top bar
import ReelCard from "@/components/ReelCard";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useMyProfile } from "@/hooks/use-my-profile";
import { CommentThread } from "@/components/comments/CommentThread";
import CommentsSheet from "@/components/comments/CommentsSheet";
import { sendOnEnter, useAutoGrow } from "@/lib/enter-key";
import { playSound } from "@/lib/sounds";

interface Reel {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  created_at: string;
  user_id: string;
  views_count: number | null;
  likes_count: number | null;
  shares_count: number | null;
  profiles: { full_name: string | null; avatar_url: string | null };
  reel_likes: { user_id: string }[];
  reel_comments: Array<{
    id: string; content: string; user_id: string; created_at: string | null;
    /** Missing until the database update for replies has been run. */
    parent_id?: string | null;
    profiles: { full_name: string | null; avatar_url: string | null };
  }>;
}

export default function Reels() {
  const navigate = useNavigate();
  const { reelId: paramReelId } = useParams();
  useSEO({ title: "Reels", description: "Watch short videos on CloudBook." });
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const { toast } = useToast();
  const [activeReelId, setActiveReelId] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const reelCommentBox = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(reelCommentBox, commentText, 110);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadVideoUrl, setUploadVideoUrl] = useState("");
  const [isMuted, setIsMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const myProfile = useMyProfile();

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
      // Unfriending is done from their profile, never by one tap on a reel.
      return;
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

  const checkAuth = useEffectEvent(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/auth"); return; }
    setUser(session.user);
    loadFriendIds(session.user.id);
  });

  const loadReels = useEffectEvent(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reels")
      .select(`*, profiles (full_name, avatar_url), reel_likes (user_id), reel_comments (*, profiles (full_name, avatar_url))`)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) {
      toast({ title: "Couldn't load reels", variant: "destructive" });
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
  });

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Reload when opening a different shared reel link.
  useEffect(() => {
    loadReels();
  }, [paramReelId, loadReels]);

  const handleLike = async (reelId: string) => {
    if (!user) return;
    const reel = reels.find(r => r.id === reelId);
    if (!reel) return;
    const hasLiked = reel.reel_likes.some(l => l.user_id === user.id);
    setReels(prev => prev.map(r => r.id === reelId
      ? { ...r, reel_likes: hasLiked ? r.reel_likes.filter(l => l.user_id !== user.id) : [...r.reel_likes, { user_id: user.id }] }
      : r
    ));
    const { error } = hasLiked
      ? await supabase.from("reel_likes").delete().eq("reel_id", reelId).eq("user_id", user.id)
      : await supabase.from("reel_likes").insert({ reel_id: reelId, user_id: user.id });
    if (error) {
      // Put it back as it was.
      setReels(prev => prev.map(r => r.id === reelId ? { ...r, reel_likes: reel.reel_likes } : r));
      toast({ title: "Couldn't save your like", variant: "destructive" });
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const { error } = await supabase.from("reel_comments").delete().eq("id", commentId);
    if (error) return;
    setReels(prev => prev.map(r => ({ ...r, reel_comments: r.reel_comments.filter(c => c.id !== commentId) })));
  };

  const handleComment = async () => {
    if (!user || !commentText.trim() || !activeReelId) return;
    const { data, error } = await supabase.from("reel_comments").insert({
      reel_id: activeReelId, user_id: user.id, content: commentText.trim(),
      ...(replyTo ? { parent_id: replyTo.id } : {}),
    }).select(`*, profiles (full_name, avatar_url)`).single();
    if (error) {
      toast({
        title: "Couldn't post your comment",
        description: replyTo && /parent_id/.test(error.message) ? "Replies need the latest database update." : undefined,
        variant: "destructive",
      });
    } else if (data) {
      setReels(prev => prev.map(r => r.id === activeReelId ? { ...r, reel_comments: [...r.reel_comments, data] } : r));
      if (replyTo) setOpenThreadId(replyTo.id);
      setCommentText("");
      setReplyTo(null);
      playSound("comment");
    }
  };

  const startReply = (parent: Reel["reel_comments"][number], mention: string | null) => {
    setReplyTo({ id: parent.id, name: parent.profiles.full_name || "User" });
    setCommentText(mention ? `@${mention.replace(/\s+/g, "")} ` : "");
    requestAnimationFrame(() => reelCommentBox.current?.focus());
  };

  const handleShare = async (reelId: string) => {
    const url = `${window.location.origin}/reels/${reelId}`;
    if (navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch {
        // Cancelled: copy instead.
      }
    }
    // No share sheet (most desktop browsers): copy the link.
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied!" });
    } catch {
      toast({ title: "Couldn't copy the link", description: url });
    }
  };

  const handleUpload = async () => {
    if (!user || !uploadVideoUrl) return;
    const { error } = await supabase.from("reels").insert({ user_id: user.id, video_url: uploadVideoUrl, caption: uploadCaption.trim() || null });
    if (error) { toast({ title: "Error uploading reel", variant: "destructive" }); }
    else { toast({ title: "Reel uploaded!" }); setShowUpload(false); setUploadCaption(""); setUploadVideoUrl(""); loadReels(); }
  };

  const handleDeleteReel = async (reelId: string) => {
    setPendingDelete(null);
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

  // Up/down arrow keys move between reels on desktop.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (showComments || showUpload || pendingDelete) return;
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, [contenteditable=true]")) return;
    if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); scroll(1); }
    if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); scroll(-1); }
  });
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

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
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-white/80 hover:text-white p-2 -m-2" aria-label="Back to home">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-white font-bold text-xl">Reels</h1>
        </div>
        <button onClick={() => setShowUpload(true)} className="text-white p-2 -m-2" aria-label="Create reel"><Plus className="h-6 w-6" /></button>
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
            className="h-[100dvh] md:h-[calc(100dvh-57px)] w-full md:w-auto overflow-y-scroll snap-y snap-mandatory scrollbar-hide overscroll-contain"
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
                onDelete={(id) => setPendingDelete(id)}
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
            <button onClick={() => scroll(-1)} aria-label="Previous reel" className="h-12 w-12 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center shadow-lg transition-colors">
              <ChevronUp className="h-6 w-6" />
            </button>
            <button onClick={() => scroll(1)} aria-label="Next reel" className="h-12 w-12 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center shadow-lg transition-colors">
              <ChevronDown className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      {/* Comments: a sheet you can pull up, with replies folded under each comment. */}
      <CommentsSheet
        open={showComments}
        onOpenChange={(open) => { setShowComments(open); if (!open) setReplyTo(null); }}
        title={`${activeReel?.reel_comments.length || 0} ${activeReel?.reel_comments.length === 1 ? "comment" : "comments"}`}
        footer={
          <form onSubmit={(e) => { e.preventDefault(); handleComment(); }} className="flex flex-col gap-1.5">
            {replyTo && (
              <div className="ml-11 flex items-center gap-2 text-xs text-muted-foreground">
                <span>Replying to <strong>{replyTo.name}</strong></span>
                <button type="button" className="text-primary hover:underline" onClick={() => { setReplyTo(null); setCommentText(""); }}>Cancel</button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <Avatar className="mb-0.5 h-9 w-9">
                <AvatarImage src={myProfile?.avatar_url || undefined} alt="" />
                <AvatarFallback>{myProfile?.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
              </Avatar>
              <textarea
                ref={reelCommentBox}
                rows={1}
                aria-label={replyTo ? "Write a reply" : "Add a comment"}
                placeholder={replyTo ? `Reply to ${replyTo.name}...` : "Add a comment..."}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={sendOnEnter}
                className="min-h-10 flex-1 resize-none rounded-[20px] bg-secondary px-4 py-2.5 text-[15px] leading-5 outline-none placeholder:text-muted-foreground"
              />
              <Button type="submit" size="icon" className="h-10 w-10 shrink-0 rounded-full" disabled={!commentText.trim()} aria-label="Post comment">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        }
      >
        {!activeReel || activeReel.reel_comments.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No comments yet. Be the first!</p>
        ) : (
          <CommentThread
            comments={activeReel.reel_comments}
            currentUserId={user?.id}
            onReply={startReply}
            onDelete={handleDeleteComment}
            initialCount={20}
            openThreadId={openThreadId}
          />
        )}
      </CommentsSheet>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this reel?</AlertDialogTitle>
            <AlertDialogDescription>It will be removed with its likes and comments.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => pendingDelete && handleDeleteReel(pendingDelete)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload Dialog */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create reel</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Video</label>
              <div className="mt-2 flex items-center justify-between rounded-lg border p-3">
                <p className="text-sm text-muted-foreground">{uploadVideoUrl ? "Video selected" : "Upload from your device"}</p>
                {user && <VideoUpload bucket="post-videos" userId={user.id} currentVideo={uploadVideoUrl} onUploadComplete={setUploadVideoUrl} label="" />}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Caption</label>
              <Textarea aria-label="Caption" maxLength={300} placeholder="Write something fun..." value={uploadCaption} onChange={(e) => setUploadCaption(e.target.value)} className="mt-1" rows={3} />
            </div>
            <Button onClick={handleUpload} className="w-full" disabled={!uploadVideoUrl}>Post Reel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
