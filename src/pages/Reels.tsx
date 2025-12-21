import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heart, MessageCircle, Share2, Upload, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const [currentReelIndex, setCurrentReelIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadCaption, setUploadCaption] = useState("");
  const [uploadVideoUrl, setUploadVideoUrl] = useState("");

  useEffect(() => {
    checkAuth();
    loadReels();
  }, []);

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
    }
    setLoading(false);
  };

  const handleLike = async (reelId: string) => {
    if (!user) return;

    const reel = reels[currentReelIndex];
    const hasLiked = reel.reel_likes.some((like) => like.user_id === user.id);

    if (hasLiked) {
      await supabase
        .from("reel_likes")
        .delete()
        .eq("reel_id", reelId)
        .eq("user_id", user.id);
    } else {
      await supabase.from("reel_likes").insert({ reel_id: reelId, user_id: user.id });
    }

    loadReels();
  };

  const handleComment = async () => {
    if (!user || !commentText.trim()) return;

    const { error } = await supabase.from("reel_comments").insert({
      reel_id: reels[currentReelIndex].id,
      user_id: user.id,
      content: commentText,
    });

    if (error) {
      toast({ title: "Error posting comment", variant: "destructive" });
    } else {
      setCommentText("");
      loadReels();
    }
  };

  const handleShare = async (reelId: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/reels/${reelId}`);
    toast({ title: "Link copied to clipboard!" });
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
      toast({ title: "Reel uploaded successfully!" });
      setShowUpload(false);
      setUploadCaption("");
      setUploadVideoUrl("");
      loadReels();
    }
  };

  const goToPrevReel = () => {
    if (currentReelIndex > 0) {
      setCurrentReelIndex(currentReelIndex - 1);
      setShowComments(false);
    }
  };

  const goToNextReel = () => {
    if (currentReelIndex < reels.length - 1) {
      setCurrentReelIndex(currentReelIndex + 1);
      setShowComments(false);
    }
  };

  const currentReel = reels[currentReelIndex];

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={user?.id} />
        <div className="flex items-center justify-center h-[calc(100vh-56px)]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={user?.id} />
      
      <div className="container mx-auto px-2 sm:px-4 py-4 max-w-lg">
        {/* Upload Button */}
        <div className="flex justify-end mb-4">
          <Dialog open={showUpload} onOpenChange={setShowUpload}>
            <DialogTrigger asChild>
              <Button size="sm" className="sm:size-default">
                <Upload className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Upload Reel</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="mx-4 sm:mx-0">
              <DialogHeader>
                <DialogTitle>Upload New Reel</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Video URL</label>
                  <Input
                    placeholder="Enter video URL"
                    value={uploadVideoUrl}
                    onChange={(e) => setUploadVideoUrl(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Caption</label>
                  <Textarea
                    placeholder="Write a caption..."
                    value={uploadCaption}
                    onChange={(e) => setUploadCaption(e.target.value)}
                  />
                </div>
                <Button onClick={handleUpload} className="w-full">
                  Upload Reel
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {reels.length === 0 ? (
          <Card className="p-8 sm:p-12 text-center">
            <p className="text-muted-foreground mb-4">No reels yet. Be the first to upload!</p>
            <Button onClick={() => setShowUpload(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Reel
            </Button>
          </Card>
        ) : (
          <>
            {currentReel && (
              <Card className="relative overflow-hidden">
                {/* Video Container */}
                <div className="relative aspect-[9/16] max-h-[70vh] sm:max-h-[75vh] bg-black">
                  <video
                    key={currentReel.id}
                    src={currentReel.video_url}
                    className="w-full h-full object-contain"
                    controls
                    autoPlay
                    loop
                    playsInline
                  />

                  {/* Overlay Content */}
                  <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <div className="flex items-start gap-2 sm:gap-3 mb-3">
                      <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
                        <AvatarImage src={currentReel.profiles.avatar_url || ""} />
                        <AvatarFallback>
                          {currentReel.profiles.full_name?.[0] || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white text-sm sm:text-base truncate">
                          {currentReel.profiles.full_name || "Anonymous"}
                        </p>
                        {currentReel.caption && (
                          <p className="text-xs sm:text-sm text-white/90 line-clamp-2">{currentReel.caption}</p>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-4 sm:gap-6 text-white">
                      <button
                        onClick={() => handleLike(currentReel.id)}
                        className="flex items-center gap-1 sm:gap-2 transition-transform active:scale-110"
                      >
                        <Heart
                          className={`h-5 w-5 sm:h-6 sm:w-6 ${
                            currentReel.reel_likes.some((like) => like.user_id === user?.id)
                              ? "fill-red-500 text-red-500"
                              : ""
                          }`}
                        />
                        <span className="text-sm">{currentReel.reel_likes.length}</span>
                      </button>

                      <button
                        onClick={() => setShowComments(!showComments)}
                        className="flex items-center gap-1 sm:gap-2"
                      >
                        <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />
                        <span className="text-sm">{currentReel.reel_comments.length}</span>
                      </button>

                      <button
                        onClick={() => handleShare(currentReel.id)}
                        className="flex items-center gap-1 sm:gap-2"
                      >
                        <Share2 className="h-5 w-5 sm:h-6 sm:w-6" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Comments Section */}
                {showComments && (
                  <div className="p-3 sm:p-4 bg-card border-t max-h-60 overflow-hidden">
                    <ScrollArea className="h-40 mb-3">
                      <div className="space-y-3 pr-2">
                        {currentReel.reel_comments.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">No comments yet</p>
                        ) : (
                          currentReel.reel_comments.map((comment) => (
                            <div key={comment.id} className="flex gap-2">
                              <Avatar className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0">
                                <AvatarImage src={comment.profiles.avatar_url || ""} />
                                <AvatarFallback>
                                  {comment.profiles.full_name?.[0] || "U"}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs sm:text-sm font-semibold truncate">
                                  {comment.profiles.full_name || "Anonymous"}
                                </p>
                                <p className="text-xs sm:text-sm text-muted-foreground break-words">{comment.content}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add a comment..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyPress={(e) => e.key === "Enter" && handleComment()}
                        className="text-sm"
                      />
                      <Button onClick={handleComment} size="sm">
                        Post
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Navigation Buttons */}
            <div className="flex justify-center gap-3 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPrevReel}
                disabled={currentReelIndex === 0}
                className="flex-1 max-w-32"
              >
                <ChevronUp className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Previous</span>
              </Button>
              <span className="flex items-center text-sm text-muted-foreground">
                {currentReelIndex + 1} / {reels.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextReel}
                disabled={currentReelIndex === reels.length - 1}
                className="flex-1 max-w-32"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}