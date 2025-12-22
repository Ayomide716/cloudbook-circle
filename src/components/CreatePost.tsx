import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Image, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "./ImageUpload";
import VideoUpload from "./VideoUpload";
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
  const [videoUrl, setVideoUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!content.trim()) {
      toast({
        title: "Content required",
        description: "Please write something to post",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    const { error } = await supabase
      .from("posts")
      .insert({
        content: content.trim(),
        user_id: currentUser.id,
        image_url: imageUrl || null,
        video_url: videoUrl || null,
      });

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
    setVideoUrl("");
    setShowDialog(false);
    toast({ title: "Post created!" });
    onPostCreated();
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

            <Textarea
              placeholder={`What's on your mind, ${currentUser.full_name?.split(' ')[0] || 'there'}?`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[120px] resize-none border-0 focus-visible:ring-0 text-lg placeholder:text-muted-foreground/60 p-0"
              disabled={isLoading}
              autoFocus
            />

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <span className="text-sm font-medium">Add to your post</span>
              <div className="flex gap-1">
                <ImageUpload
                  bucket="post-images"
                  userId={currentUser.id}
                  onUploadComplete={(url) => { setImageUrl(url); if (url) setVideoUrl(""); }}
                  currentImage={imageUrl}
                  label=""
                />
                <VideoUpload
                  bucket="post-videos"
                  userId={currentUser.id}
                  onUploadComplete={(url) => { setVideoUrl(url); if (url) setImageUrl(""); }}
                  currentVideo={videoUrl}
                  label=""
                />
              </div>
            </div>

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
              disabled={isLoading || !content.trim()}
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