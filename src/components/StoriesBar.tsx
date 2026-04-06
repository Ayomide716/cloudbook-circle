import { useEffect, useState, useCallback, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Plus, X, Send, Loader2, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "./ImageUpload";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

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

interface UserStoryGroup {
  userId: string;
  profile: { id: string; full_name: string | null; avatar_url: string | null };
  stories: Story[];
  hasUnviewed: boolean;
}

interface StoriesBarProps {
  currentUserId: string;
}

const STORY_DURATION = 5000; // 5 seconds per story

const StoriesBar = ({ currentUserId }: StoriesBarProps) => {
  const [storyGroups, setStoryGroups] = useState<UserStoryGroup[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [storyImage, setStoryImage] = useState("");
  const [storyCaption, setStoryCaption] = useState("");

  // Viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [replyText, setReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadStories();
    const cleanup = setupRealtimeSubscription();
    return cleanup;
  }, [currentUserId]);

  const loadStories = async () => {
    try {
      const { data: friendships } = await supabase
        .from("friendships")
        .select("user_id, friend_id")
        .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`)
        .eq("status", "accepted");

      const friendIds = friendships?.map(f =>
        f.user_id === currentUserId ? f.friend_id : f.user_id
      ) || [];

      const allowedUserIds = [currentUserId, ...friendIds];

      const { data, error } = await supabase
        .from("stories" as any)
        .select(`*, profiles:user_id (id, full_name, avatar_url)`)
        .in("user_id", allowedUserIds)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true });

      if (error || !data) return;

      // Fetch viewed story IDs
      const storyIds = (data as any[]).map((s: any) => s.id);
      const { data: views } = await supabase
        .from("story_views" as any)
        .select("story_id")
        .eq("viewer_id", currentUserId)
        .in("story_id", storyIds);

      const viewedIds = new Set((views || []).map((v: any) => v.story_id));

      // Group by user
      const groupMap = new Map<string, UserStoryGroup>();
      (data as any[]).forEach((story: any) => {
        const uid = story.user_id;
        if (!groupMap.has(uid)) {
          groupMap.set(uid, {
            userId: uid,
            profile: story.profiles,
            stories: [],
            hasUnviewed: false,
          });
        }
        const group = groupMap.get(uid)!;
        group.stories.push(story);
        if (!viewedIds.has(story.id)) group.hasUnviewed = true;
      });

      // Current user first, then unviewed, then viewed
      const groups = Array.from(groupMap.values());
      groups.sort((a, b) => {
        if (a.userId === currentUserId) return -1;
        if (b.userId === currentUserId) return 1;
        if (a.hasUnviewed && !b.hasUnviewed) return -1;
        if (!a.hasUnviewed && b.hasUnviewed) return 1;
        return 0;
      });

      setStoryGroups(groups);
    } catch (e) {
      console.log("Error loading stories:", e);
    }
  };

  const setupRealtimeSubscription = () => {
    const channel = supabase
      .channel("stories-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => loadStories())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  };

  const handleCreateStory = async () => {
    if (!storyImage) {
      toast({ title: "Please upload an image", variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("stories" as any)
      .insert({ user_id: currentUserId, media_url: storyImage, media_type: "image", caption: storyCaption || null } as any);

    if (error) { toast({ title: "Error creating story", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Story created!" });
    setIsCreating(false);
    setStoryImage("");
    setStoryCaption("");
    loadStories();
  };

  // ---- Viewer Logic ----
  const activeGroup = storyGroups[activeGroupIndex];
  const activeStory = activeGroup?.stories[activeStoryIndex];

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(0);
    const interval = 50;
    let elapsed = 0;
    timerRef.current = setInterval(() => {
      if (isPaused) return;
      elapsed += interval;
      setProgress(Math.min((elapsed / STORY_DURATION) * 100, 100));
      if (elapsed >= STORY_DURATION) {
        goNext();
      }
    }, interval);
  }, [isPaused, activeGroupIndex, activeStoryIndex, storyGroups.length]);

  const goNext = useCallback(() => {
    if (!activeGroup) return;
    if (activeStoryIndex < activeGroup.stories.length - 1) {
      setActiveStoryIndex(prev => prev + 1);
    } else if (activeGroupIndex < storyGroups.length - 1) {
      setActiveGroupIndex(prev => prev + 1);
      setActiveStoryIndex(0);
    } else {
      setViewerOpen(false);
    }
  }, [activeGroup, activeStoryIndex, activeGroupIndex, storyGroups.length]);

  const goPrev = useCallback(() => {
    if (activeStoryIndex > 0) {
      setActiveStoryIndex(prev => prev - 1);
    } else if (activeGroupIndex > 0) {
      setActiveGroupIndex(prev => prev - 1);
      const prevGroup = storyGroups[activeGroupIndex - 1];
      setActiveStoryIndex(prevGroup.stories.length - 1);
    }
  }, [activeStoryIndex, activeGroupIndex, storyGroups]);

  useEffect(() => {
    if (!viewerOpen) { if (timerRef.current) clearInterval(timerRef.current); return; }
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [viewerOpen, activeGroupIndex, activeStoryIndex, startTimer]);

  // Mark as viewed when story changes
  useEffect(() => {
    if (!viewerOpen || !activeStory) return;
    supabase.from("story_views" as any).insert({ story_id: activeStory.id, viewer_id: currentUserId } as any).then(() => {});
  }, [viewerOpen, activeStory?.id]);

  const openViewer = (groupIndex: number) => {
    setActiveGroupIndex(groupIndex);
    setActiveStoryIndex(0);
    setReplyText("");
    setIsPaused(false);
    setViewerOpen(true);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !activeStory) return;
    setIsSendingReply(true);
    await supabase.from("messages").insert({
      sender_id: currentUserId,
      receiver_id: activeStory.user_id,
      content: `💬 Replied to your story: "${replyText.trim()}"`,
    });
    setIsSendingReply(false);
    toast({ title: "Reply sent!" });
    setReplyText("");
  };

  const handleReaction = async (emoji: string, type: string) => {
    if (!activeStory) return;
    await supabase.from("story_reactions" as any).upsert(
      { story_id: activeStory.id, user_id: currentUserId, reaction_type: type } as any,
      { onConflict: "story_id,user_id" }
    );
    await supabase.from("messages").insert({
      sender_id: currentUserId,
      receiver_id: activeStory.user_id,
      content: `${emoji} Reacted to your story`,
    });
    toast({ title: "Reaction sent!" });
  };

  return (
    <>
      <div className="mb-4">
        <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide px-1">
          {/* Create Story */}
          <button className="flex-shrink-0 group" onClick={() => setIsCreating(true)}>
            <div className="relative w-[88px] h-[140px] sm:w-[100px] sm:h-[160px] rounded-2xl overflow-hidden border-2 border-border/60 bg-card shadow-sm transition-transform duration-200 group-hover:scale-[1.03]">
              <div className="h-[60%] bg-secondary/60 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-muted/80 flex items-center justify-center">
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
              <div className="absolute bottom-0 inset-x-0 h-[40%] bg-card flex flex-col items-center justify-center border-t border-border/50">
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center -mt-4 mb-1 border-[3px] border-card shadow-md">
                  <Plus className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
                <p className="text-[10px] font-semibold text-foreground">Create</p>
              </div>
            </div>
          </button>

          {/* Story Groups */}
          {storyGroups.map((group, index) => (
            <button
              key={group.userId}
              className="flex-shrink-0 group"
              onClick={() => openViewer(index)}
            >
              <div className={cn(
                "relative w-[88px] h-[140px] sm:w-[100px] sm:h-[160px] rounded-2xl overflow-hidden shadow-sm transition-transform duration-200 group-hover:scale-[1.03]",
                group.hasUnviewed
                  ? "ring-[2.5px] ring-primary ring-offset-2 ring-offset-background"
                  : "ring-[2px] ring-muted-foreground/20 ring-offset-1 ring-offset-background"
              )}>
                <img
                  src={group.stories[group.stories.length - 1].media_url}
                  alt="Story"
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/70" />
                <div className="absolute top-2 left-2">
                  <Avatar className={cn("h-8 w-8 border-2", group.hasUnviewed ? "border-primary" : "border-muted-foreground/40")}>
                    <AvatarImage src={group.profile.avatar_url || undefined} />
                    <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                      {group.profile.full_name?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                </div>
                {group.stories.length > 1 && (
                  <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {group.stories.length}
                  </div>
                )}
                <div className="absolute bottom-2 left-2 right-2">
                  <p className="text-white text-[10px] font-semibold leading-tight line-clamp-2 drop-shadow-lg">
                    {group.userId === currentUserId ? "Your Story" : group.profile.full_name || "User"}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Create Story Dialog */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="sm:max-w-md">
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Create Story</h2>
            <ImageUpload bucket="post-images" userId={currentUserId} onUploadComplete={setStoryImage} currentImage={storyImage} label="Upload Story Image" />
            <Input placeholder="Add a caption..." value={storyCaption} onChange={(e) => setStoryCaption(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
              <Button onClick={handleCreateStory} disabled={!storyImage}>Share Story</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full-Screen Story Viewer */}
      {viewerOpen && activeGroup && activeStory && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
          {/* Progress bars */}
          <div className="absolute top-0 left-0 right-0 z-20 flex gap-0.5 px-2 pt-2 sm:pt-3 sm:px-4">
            {activeGroup.stories.map((_, i) => (
              <div key={i} className="flex-1 h-[3px] bg-white/30 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-100 ease-linear"
                  style={{
                    width: i < activeStoryIndex ? "100%" : i === activeStoryIndex ? `${progress}%` : "0%",
                  }}
                />
              </div>
            ))}
          </div>

          {/* Header */}
          <div className="absolute top-5 sm:top-7 left-0 right-0 z-20 flex items-center justify-between px-3 sm:px-5">
            <div className="flex items-center gap-2.5">
              <Avatar className="h-9 w-9 border-2 border-white/60">
                <AvatarImage src={activeGroup.profile.avatar_url || undefined} />
                <AvatarFallback className="text-xs">{activeGroup.profile.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-white text-sm font-semibold">{activeGroup.userId === currentUserId ? "Your Story" : activeGroup.profile.full_name || "User"}</p>
                <p className="text-white/60 text-[10px]">{formatDistanceToNow(new Date(activeStory.created_at), { addSuffix: true })}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8" onClick={() => setIsPaused(p => !p)}>
                {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8" onClick={() => setViewerOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Story image */}
          <img
            src={activeStory.media_url}
            alt="Story"
            className="max-w-full max-h-full object-contain select-none"
            onPointerDown={() => setIsPaused(true)}
            onPointerUp={() => setIsPaused(false)}
          />

          {/* Caption */}
          {activeStory.caption && (
            <div className="absolute bottom-24 sm:bottom-20 left-0 right-0 z-20 text-center px-6">
              <p className="text-white text-sm bg-black/50 inline-block px-4 py-2 rounded-xl">{activeStory.caption}</p>
            </div>
          )}

          {/* Tap areas */}
          <button className="absolute top-0 left-0 w-1/3 h-full z-10" onClick={goPrev} aria-label="Previous" />
          <button className="absolute top-0 right-0 w-1/3 h-full z-10" onClick={goNext} aria-label="Next" />

          {/* Nav arrows (desktop) */}
          {activeGroupIndex > 0 && (
            <button className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm items-center justify-center text-white hover:bg-white/30" onClick={goPrev}>
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {(activeStoryIndex < activeGroup.stories.length - 1 || activeGroupIndex < storyGroups.length - 1) && (
            <button className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm items-center justify-center text-white hover:bg-white/30" onClick={goNext}>
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          {/* Reply & reactions (not own story) */}
          {activeGroup.userId !== currentUserId && (
            <div className="absolute bottom-0 left-0 right-0 z-20 p-3 sm:p-4 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center gap-1.5 justify-center mb-2">
                {[
                  { emoji: "❤️", type: "love" }, { emoji: "😂", type: "haha" }, { emoji: "😮", type: "wow" },
                  { emoji: "👍", type: "like" }, { emoji: "🔥", type: "fire" }, { emoji: "😢", type: "sad" },
                ].map((r) => (
                  <button key={r.type} onClick={() => handleReaction(r.emoji, r.type)} className="text-xl sm:text-2xl hover:scale-125 transition-transform p-0.5">
                    {r.emoji}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 max-w-lg mx-auto">
                <Input
                  placeholder="Reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/50 h-9 text-sm"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSendReply(); } }}
                  onFocus={() => setIsPaused(true)}
                  onBlur={() => setIsPaused(false)}
                  disabled={isSendingReply}
                />
                <Button size="icon" variant="ghost" className="text-white h-9 w-9 hover:bg-white/20" onClick={handleSendReply} disabled={!replyText.trim() || isSendingReply}>
                  {isSendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default StoriesBar;
