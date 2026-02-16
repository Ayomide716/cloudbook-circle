import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Plus, X, Send, Loader2 } from "lucide-react";
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
  const [replyText, setReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadStories();
    setupRealtimeSubscription();
  }, [currentUserId]);

  const loadStories = async () => {
    try {
      // First, get the list of friends (accepted friendships)
      const { data: friendships } = await supabase
        .from("friendships")
        .select("user_id, friend_id")
        .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
        .eq("status", "accepted");

      // Extract friend IDs
      const friendIds = friendships?.map(f => 
        f.user_id === currentUserId ? f.friend_id : f.user_id
      ) || [];

      // Include current user's own stories
      const allowedUserIds = [currentUserId, ...friendIds];

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
        .in("user_id", allowedUserIds)
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
    setReplyText("");
    
    // Mark story as viewed
    await supabase
      .from("story_views" as any)
      .insert({
        story_id: story.id,
        viewer_id: currentUserId,
      } as any);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedStory) return;
    
    setIsSendingReply(true);

    // Send as a direct message to the story owner
    const { error } = await supabase
      .from("messages")
      .insert({
        sender_id: currentUserId,
        receiver_id: selectedStory.user_id,
        content: `💬 Replied to your story: "${replyText.trim()}"`,
      });

    setIsSendingReply(false);

    if (error) {
      toast({
        title: "Error sending reply",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Reply sent!",
    });
    setReplyText("");
  };

  return (
    <>
      <div className="mb-4">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {/* Create Story Card */}
          <div
            className="flex-shrink-0 cursor-pointer group"
            onClick={() => setIsCreating(true)}
          >
            <div className="relative w-[112px] h-[200px] rounded-xl overflow-hidden border border-border bg-card">
              <div className="h-[140px] bg-secondary flex items-center justify-center">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    <Plus className="h-6 w-6" />
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="absolute bottom-0 inset-x-0 h-[60px] bg-card flex flex-col items-center justify-center border-t border-border">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center -mt-4 mb-1 border-4 border-card">
                  <Plus className="h-4 w-4 text-primary-foreground" />
                </div>
                <p className="text-xs font-medium">Create story</p>
              </div>
            </div>
          </div>

          {/* Story Cards */}
          {stories.map((story) => (
            <div
              key={story.id}
              className="flex-shrink-0 cursor-pointer group"
              onClick={() => handleViewStory(story)}
            >
              <div className="relative w-[112px] h-[200px] rounded-xl overflow-hidden border border-border">
                <img
                  src={story.media_url}
                  alt="Story"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
                {/* User avatar with ring */}
                <div className="absolute top-2 left-2">
                  <Avatar className="h-9 w-9 border-[3px] border-primary">
                    <AvatarImage src={story.profiles.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">
                      {story.profiles.full_name?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </div>
                {/* Name at bottom */}
                <div className="absolute bottom-2 left-2 right-2">
                  <p className="text-white text-xs font-semibold leading-tight line-clamp-2 drop-shadow-md">
                    {story.user_id === currentUserId
                      ? "Your Story"
                      : story.profiles.full_name || "Anonymous"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Story Dialog */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="sm:max-w-md">
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
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden">
          {selectedStory && (
            <div className="relative flex flex-col max-h-[85vh]">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/70 text-white"
                onClick={() => setSelectedStory(null)}
              >
                <X className="h-5 w-5" />
              </Button>
              
              <div className="flex-1 min-h-0 bg-black flex items-center justify-center">
                <img
                  src={selectedStory.media_url}
                  alt="Story"
                  className="w-full h-auto max-h-[60vh] object-contain"
                />
              </div>
              
              {/* Story info overlay */}
              <div className="absolute bottom-20 sm:bottom-16 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10 border-2 border-white">
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

              {/* Reply input - only show if not viewing own story */}
              {selectedStory.user_id !== currentUserId && (
                <div className="bg-background p-3 border-t flex items-center gap-2">
                  <Input
                    placeholder="Reply to this story..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendReply();
                      }
                    }}
                    disabled={isSendingReply}
                  />
                  <Button
                    size="icon"
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || isSendingReply}
                  >
                    {isSendingReply ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default StoriesBar;