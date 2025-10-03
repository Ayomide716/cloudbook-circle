import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Image, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
    toast({
      title: "Post created!",
    });
    onPostCreated();
  };

  return (
    <Card className="p-4">
      <form onSubmit={handleSubmit}>
        <div className="flex gap-3">
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
            
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled
              >
                <Image className="h-5 w-5 mr-2" />
                Photo
              </Button>
              
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