import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "./ImageUpload";

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
    toast({
      title: "Post created!",
    });
    onPostCreated();
  };

  return (
    <Card className="p-3 sm:p-4">
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2 sm:gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={currentUser.avatar_url || undefined} />
            <AvatarFallback>
              {currentUser.full_name?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 space-y-3">
            <Textarea
              placeholder="What's on your mind?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[100px] resize-none"
              disabled={isLoading}
            />
            
            <ImageUpload
              bucket="post-images"
              userId={currentUser.id}
              onUploadComplete={setImageUrl}
              currentImage={imageUrl}
              label="Add Photo"
            />

            <div className="space-y-2">
              <label className="text-sm font-medium">Video URL (optional)</label>
              <Input
                type="url"
                placeholder="Enter video URL"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                className="text-sm"
              />
            </div>
            
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isLoading || !content.trim()}
              >
                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Post
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Card>
  );
};

export default CreatePost;