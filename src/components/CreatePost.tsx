import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Image, Video, BarChart3, X, Images } from "lucide-react";
import PostExpirySelector from "./PostExpirySelector";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "./ImageUpload";
import VideoUpload from "./VideoUpload";
import PollCreator from "./PollCreator";
import MultiImageUpload from "./MultiImageUpload";
import MentionInput from "./MentionInput";
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
  const [imageUrl, setImageUrl] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [pollData, setPollData] = useState<{ question: string; options: string[] } | null>(null);
  const [postExpiry, setPostExpiry] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
     if (!content.trim() && !pollData) {
      toast({
        title: "Content required",
        description: "Please write something to post",
        variant: "destructive",
      });
      return;
    }

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
        image_url: imageUrl || (imageUrls.length === 1 ? imageUrls[0] : null),
        image_urls: imageUrls.length > 0 ? imageUrls : [],
        video_url: videoUrl || null,
        expires_at: expiresAt,
       } as any)
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

    if (error) {
      toast({
        title: "Error creating post",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setContent("");
    setImageUrl("");
    setImageUrls([]);
    setVideoUrl("");
    setPollData(null);
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
      <Card className="p-3 sm:p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={currentUser.avatar_url || undefined} />
            <AvatarFallback className="bg-secondary text-secondary-foreground">
              {currentUser.full_name?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          
          <button
            onClick={() => setShowDialog(true)}
            className="flex-1 text-left px-4 py-2.5 bg-secondary hover:bg-secondary/80 rounded-full text-muted-foreground transition-colors text-sm sm:text-base"
          >
            What's on your mind, {currentUser.full_name?.split(' ')[0] || 'there'}?
          </button>
        </div>

        <div className="flex items-center justify-around mt-3 pt-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-muted-foreground hover:bg-accent gap-2"
            onClick={() => setShowDialog(true)}
          >
            <Image className="h-5 w-5 text-green-500" />
            <span className="hidden sm:inline">Photo</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 text-muted-foreground hover:bg-accent gap-2"
            onClick={() => setShowDialog(true)}
          >
            <Video className="h-5 w-5 text-red-500" />
            <span className="hidden sm:inline">Video</span>
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
                <ImageUpload
                  bucket="post-images"
                  userId={currentUser.id}
                  onUploadComplete={(url) => { setImageUrl(url); if (url) { setVideoUrl(""); setImageUrls([]); } }}
                  currentImage={imageUrl}
                  label=""
                />
                <MultiImageUpload
                  bucket="post-images"
                  userId={currentUser.id}
                  onUploadComplete={(urls) => { setImageUrls(urls); if (urls.length > 0) { setImageUrl(""); setVideoUrl(""); } }}
                  currentImages={imageUrls}
                />
                <VideoUpload
                  bucket="post-videos"
                  userId={currentUser.id}
                  onUploadComplete={(url) => { setVideoUrl(url); if (url) { setImageUrl(""); setImageUrls([]); } }}
                  currentVideo={videoUrl}
                  label=""
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
 
            {(imageUrl || videoUrl) && (
              <div className="relative rounded-lg overflow-hidden bg-secondary">
                {imageUrl && (
                  <img src={imageUrl} alt="Preview" className="w-full max-h-60 object-cover" />
                )}
                {videoUrl && (
                  <video src={videoUrl} className="w-full max-h-60 bg-black" controls playsInline preload="metadata" />
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => { setImageUrl(""); setVideoUrl(""); }}
                >
                  Remove
                </Button>
              </div>
            )}
            
            <Button
              type="submit"
              className="w-full"
               disabled={isLoading || (!content.trim() && !pollData)}
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Post
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CreatePost;