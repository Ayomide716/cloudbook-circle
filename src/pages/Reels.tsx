import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heart, MessageCircle, Share2, Play, Upload } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    loadReels();
  }, []);

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

  const currentReel = reels[currentReelIndex];

  if (loading) {
    return <div className="container mx-auto p-4">Loading reels...</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-lg relative">
        <div className="fixed top-4 right-4 z-50">
          <Dialog open={showUpload} onOpenChange={setShowUpload}>
            <DialogTrigger asChild>
              <Button size="lg" className="rounded-full">
                <Upload className="h-5 w-5 mr-2" />
                Upload Reel
              </Button>
            </DialogTrigger>
            <DialogContent>
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

        {currentReel && (
          <Card className="relative h-[80vh] overflow-hidden">
            <video
              src={currentReel.video_url}
              className="w-full h-full object-cover"
              controls
              autoPlay
              loop
            />

            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-start gap-3 mb-4">
                <Avatar>
                  <AvatarImage src={currentReel.profiles.avatar_url || ""} />
                  <AvatarFallback>
                    {currentReel.profiles.full_name?.[0] || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-semibold text-white">
                    {currentReel.profiles.full_name || "Anonymous"}
                  </p>
                  {currentReel.caption && (
                    <p className="text-sm text-white/90">{currentReel.caption}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-6 text-white">
                <button
                  onClick={() => handleLike(currentReel.id)}
                  className="flex items-center gap-2"
                >
                  <Heart
                    className={`h-6 w-6 ${
                      currentReel.reel_likes.some((like) => like.user_id === user?.id)
                        ? "fill-red-500 text-red-500"
                        : ""
                    }`}
                  />
                  <span>{currentReel.reel_likes.length}</span>
                </button>

                <button
                  onClick={() => setShowComments(!showComments)}
                  className="flex items-center gap-2"
                >
                  <MessageCircle className="h-6 w-6" />
                  <span>{currentReel.reel_comments.length}</span>
                </button>

                <button
                  onClick={() => handleShare(currentReel.id)}
                  className="flex items-center gap-2"
                >
                  <Share2 className="h-6 w-6" />
                </button>
              </div>

              {showComments && (
                <div className="mt-4 bg-background/95 backdrop-blur rounded-lg p-4 max-h-60 overflow-y-auto">
                  <div className="space-y-3 mb-3">
                    {currentReel.reel_comments.map((comment) => (
                      <div key={comment.id} className="flex gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={comment.profiles.avatar_url || ""} />
                          <AvatarFallback>
                            {comment.profiles.full_name?.[0] || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-foreground">
                            {comment.profiles.full_name || "Anonymous"}
                          </p>
                          <p className="text-sm text-muted-foreground">{comment.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleComment()}
                    />
                    <Button onClick={handleComment} size="sm">
                      Post
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        <div className="flex justify-center gap-4 mt-4">
          <Button
            onClick={() => setCurrentReelIndex(Math.max(0, currentReelIndex - 1))}
            disabled={currentReelIndex === 0}
          >
            Previous
          </Button>
          <Button
            onClick={() =>
              setCurrentReelIndex(Math.min(reels.length - 1, currentReelIndex + 1))
            }
            disabled={currentReelIndex === reels.length - 1}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
