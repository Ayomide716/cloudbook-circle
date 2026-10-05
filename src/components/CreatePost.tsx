import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Image, X } from "lucide-react";
import PostExpirySelector from "./PostExpirySelector";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import VideoUpload from "./VideoUpload";
import PollCreator from "./PollCreator";
import MultiImageUpload from "./MultiImageUpload";
import MentionInput from "./MentionInput";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CreatePostProps {
  currentUser: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  onPostCreated: () => void;
}

const CreatePost = ({ currentUser, onPostCreated }: CreatePostProps) => {
  const [content, setContent] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [pollData, setPollData] = useState<{ question: string; options: string[] } | null>(null);
  const [postExpiry, setPostExpiry] = useState<string | null>(null);
  const { toast } = useToast();
  // The top bar's "+" opens the composer from anywhere (via /?compose=1).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("compose") !== "1") return;
    setShowDialog(true);
    const next = new URLSearchParams(searchParams);
    next.delete("compose");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // A second tap can land before React disables the button; the ref blocks it at once.
  const submittingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    
     if (!content.trim() && !pollData) {
      toast({
        title: "Content required",
        description: "Please write something to post",
        variant: "destructive",
      });
      return;
    }

    submittingRef.current = true;
    setIsLoading(true);

    // Calculate expires_at from post expiry setting
    let expiresAt: string | null = null;
    if (postExpiry === "24h") expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    else if (postExpiry === "7d") expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    else if (postExpiry === "30d") expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: postData, error } = await supabase
      .from("posts")
      .insert({
        content: content.trim() || (pollData ? `📊 ${pollData.question}` : ""),
        user_id: currentUser.id,
        // image_url is the cover (profile photo grids, link previews); image_urls has them all.
        image_url: imageUrls[0] ?? null,
        image_urls: imageUrls,
        video_url: videoUrl || null,
        expires_at: expiresAt,
       })
       .select()
       .single();

     if (!error && postData && pollData) {
       // Create the poll
       await supabase.from("polls").insert({
         post_id: postData.id,
         question: pollData.question,
         options: pollData.options,
         user_id: currentUser.id,
       });
     }
 
    setIsLoading(false);
    submittingRef.current = false;

    if (error) {
      toast({
        title: "Error creating post",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setContent("");
    setImageUrls([]);
    setVideoUrl("");
    setPollData(null);
    setPostExpiry(null);
    setShowDialog(false);
    toast({ title: "Post created!" });
    onPostCreated();
  };
 
   const handleCreatePoll = (question: string, options: string[]) => {
     setPollData({ question, options });
     setContent(`📊 ${question}`);
   };

  return (
    <>
      {/* Compact Create Post Card */}
      <Card className="feed-section p-3 sm:p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={currentUser.avatar_url || undefined} />
            <AvatarFallback className="bg-secondary text-secondary-foreground">
              {currentUser.full_name?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          
          <button
            onClick={() => setShowDialog(true)}
            className="flex-1 min-w-0 h-10 text-left px-4 bg-secondary hover:bg-secondary/80 rounded-full text-muted-foreground transition-colors text-[15px] sm:text-base truncate"
          >
            {/* Long names don't fit on a phone; the shorter prompt reads better than a cut-off name. */}
            <span className="sm:hidden">What's on your mind?</span>
            <span className="hidden sm:inline">What's on your mind, {currentUser.full_name?.split(' ')[0] || 'there'}?</span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 flex-shrink-0 rounded-full text-primary hover:bg-primary/10"
            onClick={() => setShowDialog(true)}
            aria-label="Add photos or video"
          >
            <Image className="h-5 w-5" />
          </Button>
        </div>
      </Card>

      {/* Full Create Post Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create post</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={currentUser.avatar_url || undefined} />
                <AvatarFallback>
                  {currentUser.full_name?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <p className="font-semibold">{currentUser.full_name || "Anonymous"}</p>
            </div>

            <MentionInput
              placeholder={`What's on your mind, ${currentUser.full_name?.split(' ')[0] || 'there'}? Use @ to mention friends`}
              value={content}
              onChange={setContent}
              className="min-h-[120px] resize-none border-0 focus-visible:ring-0 text-lg placeholder:text-muted-foreground/60 p-0"
              disabled={isLoading}
            />

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <span className="text-sm font-medium">Add to your post</span>
              <div className="flex gap-1">
                <MultiImageUpload
                  bucket="post-images"
                  userId={currentUser.id}
                  onUploadComplete={(urls) => { setImageUrls(urls); if (urls.length > 0) setVideoUrl(""); }}
                  currentImages={imageUrls}
                  showPreview={false}
                />
                <VideoUpload
                  bucket="post-videos"
                  userId={currentUser.id}
                  onUploadComplete={(url) => { setVideoUrl(url); if (url) setImageUrls([]); }}
                  currentVideo={videoUrl}
                  label="Add video"
                  showPreview={false}
                />
                <PollCreator onCreatePoll={handleCreatePoll} />
              </div>
            </div>

             {pollData && (
               <div className="relative bg-secondary/50 rounded-lg p-3">
                 <Button
                   type="button"
                   variant="ghost"
                   size="icon"
                   className="absolute top-1 right-1 h-6 w-6"
                   onClick={() => { setPollData(null); setContent(""); }}
                 >
                   <X className="h-4 w-4" />
                 </Button>
                 <p className="font-medium text-sm mb-2">📊 {pollData.question}</p>
                 <div className="space-y-1">
                   {pollData.options.map((opt, i) => (
                     <div key={i} className="bg-secondary rounded-lg px-3 py-2 text-sm">
                       {opt}
                     </div>
                   ))}
                 </div>
               </div>
             )}
 
            {/* One preview area for whatever is attached: the whole photo (not cropped), a grid
                for several photos, or the video. Each item can be removed. */}
            {videoUrl && (
              <div className="relative rounded-xl overflow-hidden bg-muted">
                <video src={videoUrl} className="w-full max-h-80 bg-black" controls playsInline preload="metadata" />
                <button
                  type="button"
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/75 transition-colors"
                  onClick={() => setVideoUrl("")}
                  aria-label="Remove video"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {imageUrls.length === 1 && (
              <div className="relative rounded-xl overflow-hidden bg-muted">
                <img src={imageUrls[0]} alt="Attached photo" className="w-full max-h-80 object-contain" />
                <button
                  type="button"
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/75 transition-colors"
                  onClick={() => setImageUrls([])}
                  aria-label="Remove photo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {imageUrls.length > 1 && (
              <div className={cn("grid gap-2", imageUrls.length === 2 || imageUrls.length === 4 ? "grid-cols-2" : "grid-cols-3")}>
                {imageUrls.map((url, i) => (
                  <div key={url} className="relative aspect-square rounded-xl overflow-hidden bg-muted">
                    <img src={url} alt={`Attached photo ${i + 1}`} className="h-full w-full object-cover" />
                    {i === 0 && (
                      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">Cover</span>
                    )}
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/75 transition-colors"
                      onClick={() => setImageUrls((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove photo ${i + 1}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1">
                <PostExpirySelector value={postExpiry} onChange={setPostExpiry} />
              </div>
              {postExpiry && (
                <span className="text-xs text-muted-foreground">
                  ⏱ Auto-deletes after {postExpiry === "24h" ? "24h" : postExpiry === "7d" ? "7d" : "30d"}
                </span>
              )}
            </div>

            {/* Stays visible at the bottom of the sheet, even with a long post or the keyboard open. */}
            <div className="sticky -bottom-4 sm:-bottom-6 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 px-4 sm:px-6 pt-2 pb-4 sm:pb-6 bg-background border-t border-border/50">
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || (!content.trim() && !pollData)}
              >
                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Post
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CreatePost;