import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "./ImageUpload";

interface Story {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  created_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface StoriesBarProps {
  currentUserId: string;
}

const StoriesBar = ({ currentUserId }: StoriesBarProps) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [storyImage, setStoryImage] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    loadStories();
    setupRealtimeSubscription();
  }, [currentUserId]);

  const loadStories = async () => {
    try {
      const { data, error } = await supabase
        .from("stories" as any)
        .select(`
          *,
          profiles:user_id (
            id,
            full_name,
            avatar_url
          )
        `)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (error) {
        console.log("Stories not yet available:", error.message);
        return;
      }

      if (data) {
        // Group stories by user
        const groupedStories: Story[] = [];
        const seenUsers = new Set<string>();
        
        data.forEach((story: any) => {
          if (!seenUsers.has(story.user_id)) {
            groupedStories.push(story);
            seenUsers.add(story.user_id);
          }
        });
        
        setStories(groupedStories);
      }
    } catch (error) {
      console.log("Error loading stories:", error);
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel("stories-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stories",
        },
        () => {
          loadStories();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  const handleCreateStory = async () => {
    if (!storyImage) {
      toast({
        title: "Please upload an image",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from("stories" as any)
      .insert({
        user_id: currentUserId,
        media_url: storyImage,
        media_type: "image",
      } as any);

    if (error) {
      toast({
        title: "Error creating story",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Story created!",
    });
    setIsCreating(false);
    setStoryImage("");
    loadStories();
  };

  const handleViewStory = async (story: Story) => {
    setSelectedStory(story);
    
    // Mark story as viewed
    await supabase
      .from("story_views" as any)
      .insert({
        story_id: story.id,
        viewer_id: currentUserId,
      } as any);
  };

  return (
    <>
      <Card className="p-3 sm:p-4 mb-4 overflow-hidden">
        <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 scrollbar-hide">
          <div
            className="flex-shrink-0 cursor-pointer"
            onClick={() => setIsCreating(true)}
          >
            <div className="relative">
              <Avatar className="h-14 w-14 sm:h-16 sm:w-16 border-2 border-primary">
                <AvatarFallback>
                  <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
                </AvatarFallback>
              </Avatar>
            </div>
            <p className="text-[10px] sm:text-xs text-center mt-1 w-14 sm:w-16 truncate">Create Story</p>
          </div>

          {stories.map((story) => (
            <div
              key={story.id}
              className="flex-shrink-0 cursor-pointer hover:scale-105 transition-transform"
              onClick={() => handleViewStory(story)}
            >
              <div className="relative">
                <Avatar className="h-14 w-14 sm:h-16 sm:w-16 border-4 border-primary">
                  <AvatarImage src={story.profiles.avatar_url || undefined} />
                  <AvatarFallback>
                    {story.profiles.full_name?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </div>
              <p className="text-[10px] sm:text-xs text-center mt-1 w-14 sm:w-16 truncate">
                {story.user_id === currentUserId
                  ? "Your Story"
                  : story.profiles.full_name || "Anonymous"}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* Create Story Dialog */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent>
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Create Story</h2>
            <ImageUpload
              bucket="post-images"
              userId={currentUserId}
              onUploadComplete={setStoryImage}
              currentImage={storyImage}
              label="Upload Story Image"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreating(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateStory} disabled={!storyImage}>
                Share Story
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Story Dialog */}
      <Dialog open={!!selectedStory} onOpenChange={() => setSelectedStory(null)}>
        <DialogContent className="max-w-2xl p-0">
          {selectedStory && (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white"
                onClick={() => setSelectedStory(null)}
              >
                <X className="h-5 w-5" />
              </Button>
              <img
                src={selectedStory.media_url}
                alt="Story"
                className="w-full h-auto max-h-[80vh] object-contain"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={selectedStory.profiles.avatar_url || undefined} />
                    <AvatarFallback>
                      {selectedStory.profiles.full_name?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-white font-semibold">
                    {selectedStory.profiles.full_name || "Anonymous"}
                  </p>
                </div>
                {selectedStory.caption && (
                  <p className="text-white mt-2">{selectedStory.caption}</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StoriesBar;