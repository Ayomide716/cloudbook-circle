import { useEffect, useState, useCallback, useRef } from "react";
import { useSingleFlight } from "@/hooks/use-single-flight";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Plus, X, Send, Loader2, ChevronLeft, ChevronRight, Pause, Play, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ImageUpload from "./ImageUpload";
import VideoUpload from "./VideoUpload";
import { POSTED_EVENT, isVideoJobRef, postWhenReady } from "@/lib/video-jobs";
import { BLANK_POSTER } from "@/lib/video-poster";
import LiveRoomStories from "./LiveRoomStories";
import { useMyProfile } from "@/hooks/use-my-profile";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useEffectEvent } from "@/hooks/use-effect-event";
import { dbChannel } from "@/lib/realtime";
import ReactionEmoji from "@/components/reactions/ReactionEmoji";

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
  /** How many times these stories were viewed (only counted where you may see the views). */
  views: number;
}

interface StoriesBarProps {
  currentUserId: string;
}

const STORY_DURATION = 5000; // 5 seconds per photo story
/** Video stories, as on Facebook and WhatsApp status. */
const STORY_MAX_SECONDS = 60;

const StoriesBar = ({ currentUserId }: StoriesBarProps) => {
  const myProfile = useMyProfile();
  const [storyGroups, setStoryGroups] = useState<UserStoryGroup[]>([]);
  const myGroup = storyGroups.find((g) => g.userId === currentUserId);
  const [isCreating, setIsCreating] = useState(false);
  const [storyImage, setStoryImage] = useState("");
  // A video story (its address, or a "videojob:…" reference while it's prepared in the background).
  const [storyVideo, setStoryVideo] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [storyCaption, setStoryCaption] = useState("");
  // "Add to story" on your profile opens this dialog (via /?story=1).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("story") !== "1") return;
    setIsCreating(true);
    const next = new URLSearchParams(searchParams);
    next.delete("story");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

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

  const loadStories = useEffectEvent(async () => {
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
        .from("stories")
        .select(`*, profiles:user_id (id, full_name, avatar_url)`)
        .in("user_id", allowedUserIds)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true });

      if (error || !data) return;

      // Fetch viewed story IDs
      const storyIds = data.map((s) => s.id);
      const { data: views } = await supabase
        .from("story_views")
        .select("story_id")
        .eq("viewer_id", currentUserId)
        .in("story_id", storyIds);

      const viewedIds = new Set((views || []).map((v) => v.story_id));
      // View counts, shown on the cards as "3.4K views".
      const { data: allViews } = await supabase.from("story_views").select("story_id").in("story_id", storyIds);
      const viewsPerStory = new Map<string, number>();
      for (const v of allViews ?? []) viewsPerStory.set(v.story_id, (viewsPerStory.get(v.story_id) ?? 0) + 1);

      // Group by user
      const groupMap = new Map<string, UserStoryGroup>();
      data.forEach((story) => {
        const uid = story.user_id;
        if (!groupMap.has(uid)) {
          groupMap.set(uid, {
            userId: uid,
            profile: story.profiles,
            stories: [],
            hasUnviewed: false,
            views: 0,
          });
        }
        const group = groupMap.get(uid)!;
        group.stories.push(story);
        group.views += viewsPerStory.get(story.id) ?? 0;
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
  });

  const setupRealtimeSubscription = useEffectEvent(() => {
    const channel = dbChannel("stories-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => loadStories())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  });

  useEffect(() => {
    loadStories();
    const cleanup = setupRealtimeSubscription();
    return cleanup;
  }, [currentUserId, loadStories, setupRealtimeSubscription]);

  // A video story finished uploading in the background: show it.
  useEffect(() => {
    const onPosted = (e: Event) => {
      if ((e as CustomEvent<{ label?: string }>).detail?.label === "story") loadStories();
    };
    window.addEventListener(POSTED_EVENT, onPosted);
    return () => window.removeEventListener(POSTED_EVENT, onPosted);
  }, [loadStories]);

  // Extra taps while this is saving do nothing (no double posts on a slow network).
  const onceHandleCreateStory = useSingleFlight();
  const handleCreateStory = onceHandleCreateStory(async () => {
    if (!storyImage && !storyVideo) {
      toast({ title: "Add a photo or a video", variant: "destructive" });
      return;
    }
    const caption = storyCaption || null;
    const save = async (mediaUrl: string, type: "image" | "video") => {
      const { error } = await supabase.from("stories").insert({ user_id: currentUserId, media_url: mediaUrl, media_type: type, caption });
      if (error) throw error;
    };
    const done = () => { setIsCreating(false); setStoryImage(""); setStoryVideo(""); setStoryCaption(""); };
    // A video still being prepared or uploaded: posted from the background when it's ready.
    if (isVideoJobRef(storyVideo)) {
      postWhenReady(storyVideo, "story", (url) => save(url, "video"));
      done();
      return;
    }
    try {
      await save(storyVideo || storyImage, storyVideo ? "video" : "image");
    } catch (e) {
      toast({ title: "Error creating story", description: (e as Error).message, variant: "destructive" });
      return;
    }
    done();
    loadStories();
  });

  // ---- Viewer Logic ----
  const activeGroup = storyGroups[activeGroupIndex];
  const activeStory = activeGroup?.stories[activeStoryIndex];
  const isOwnStory = activeGroup?.userId === currentUserId;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteStory = async () => {
    if (!activeStory) return;
    setIsDeleting(true);
    const { error } = await supabase.from("stories").delete().eq("id", activeStory.id).eq("user_id", currentUserId);
    setIsDeleting(false);
    setConfirmDelete(false);
    if (error) {
      toast({ title: "Couldn't delete story", description: error.message, variant: "destructive" });
      setIsPaused(false);
      return;
    }
    const remaining = activeGroup.stories.filter((st) => st.id !== activeStory.id);
    setStoryGroups((groups) =>
      remaining.length
        ? groups.map((g, i) => (i === activeGroupIndex ? { ...g, stories: remaining } : g))
        : groups.filter((_, i) => i !== activeGroupIndex)
    );
    if (remaining.length === 0) {
      setViewerOpen(false);
    } else {
      setActiveStoryIndex((idx) => Math.min(idx, remaining.length - 1));
      setIsPaused(false);
    }
  };

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

  // Read the latest pause state inside the timer without restarting it (pausing must not reset progress).
  const isPausedRef = useRef(isPaused);
  const isVideoRef = useRef(false);
  isVideoRef.current = activeStory?.media_type === "video";
  // Holding a video story pauses the video too.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPaused) v.pause();
    else void v.play().catch(() => {});
  }, [isPaused, activeStory?.id]);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);
  const advanceStory = useEffectEvent(() => goNext());

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(0);
    const interval = 50;
    let elapsed = 0;
    timerRef.current = setInterval(() => {
      // A video story moves on when the video ends (its progress comes from the video itself).
      if (isPausedRef.current || isVideoRef.current) return;
      elapsed += interval;
      setProgress(Math.min((elapsed / STORY_DURATION) * 100, 100));
      if (elapsed >= STORY_DURATION) {
        advanceStory();
      }
    }, interval);
  }, [advanceStory]);

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
  const activeStoryId = activeStory?.id;
  useEffect(() => {
    if (!viewerOpen || !activeStoryId) return;
    supabase.from("story_views").insert({ story_id: activeStoryId, viewer_id: currentUserId }).then(() => {});
  }, [viewerOpen, activeStoryId, currentUserId]);

  const openViewer = (groupIndex: number) => {
    setActiveGroupIndex(groupIndex);
    setActiveStoryIndex(0);
    setReplyText("");
    setIsPaused(false);
    setViewerOpen(true);
  };

  // Extra taps while this is saving do nothing (no double posts on a slow network).
  const onceHandleSendReply = useSingleFlight();
  const handleSendReply = onceHandleSendReply(async () => {
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
  });

  const handleReaction = async (emoji: string, type: string) => {
    if (!activeStory) return;
    await supabase.from("story_reactions").upsert(
      { story_id: activeStory.id, user_id: currentUserId, reaction_type: type },
      { onConflict: "story_id,user_id" }
    );
    await supabase.from("messages").insert({
      sender_id: currentUserId,
      receiver_id: activeStory.user_id,
      content: `${emoji} Reacted to your story`,
    });
  };

  return (
    <>
      {/* Stories as round bubbles, as on Instagram: yours first (tap + to add one), a coloured
          ring on anything you haven't watched, and the name underneath. */}
      <div className="feed-stories sm:mb-4">
        <div className="flex gap-3.5 overflow-x-auto px-3 py-2 scrollbar-hide sm:px-1">
          {!myGroup && (
            <StoryBubble label="Your story" onClick={() => setIsCreating(true)} ariaLabel="Create a story" ring="none" add>
              <Avatar className="h-full w-full">
                <AvatarImage src={myProfile?.avatar_url || undefined} className="object-cover" />
                <AvatarFallback className="bg-secondary font-display text-xl font-bold text-primary">{myProfile?.full_name?.[0]?.toUpperCase() || "+"}</AvatarFallback>
              </Avatar>
            </StoryBubble>
          )}

          {/* Live voice rooms in your groups */}
          <LiveRoomStories currentUserId={currentUserId} />

          {storyGroups.map((group, index) => {
            const mine = group.userId === currentUserId;
            return (
              <StoryBubble
                key={group.userId}
                label={mine ? "Your story" : group.profile.full_name?.split(" ")[0] || "User"}
                ariaLabel={mine ? "Your story" : `${group.profile.full_name || "User"}'s story`}
                onClick={() => openViewer(index)}
                ring={group.hasUnviewed ? "new" : "seen"}
                onAdd={mine ? () => setIsCreating(true) : undefined}
              >
                <Avatar className="h-full w-full">
                  <AvatarImage src={group.profile.avatar_url || undefined} className="object-cover" />
                  <AvatarFallback className="bg-secondary text-lg font-bold">{group.profile.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                </Avatar>
              </StoryBubble>
            );
          })}
        </div>
      </div>

      {/* Create Story Dialog */}
      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="sm:max-w-md">
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Create Story</h2>
            {!storyVideo && (
              <ImageUpload bucket="post-images" userId={currentUserId} onUploadComplete={setStoryImage} currentImage={storyImage} label="Upload Story Image" />
            )}
            {!storyImage && (
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                {!storyVideo && <p className="text-sm text-muted-foreground">Or a video (up to {STORY_MAX_SECONDS} seconds)</p>}
                <div className={storyVideo ? "w-full" : undefined}>
                  <VideoUpload bucket="post-videos" userId={currentUserId} currentVideo={storyVideo} onUploadComplete={setStoryVideo} label="" maxSeconds={STORY_MAX_SECONDS} />
                </div>
              </div>
            )}
            <Input placeholder="Add a caption..." value={storyCaption} onChange={(e) => setStoryCaption(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreating(false)}>Cancel</Button>
              <Button onClick={handleCreateStory} disabled={!storyImage && !storyVideo}>Share Story</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Full-Screen Story Viewer */}
      {/* Rendered at <body> level so no transformed/filtered ancestor (pull-to-refresh, page
          animations) can offset the full-screen viewer. */}
      {viewerOpen && activeGroup && activeStory && createPortal(
        <div className="fixed inset-x-0 top-0 bottom-[var(--keyboard-inset,0px)] z-[100] bg-black flex items-center justify-center">
          {/* Progress bars */}
          {/* Below the phone's status bar (the Android app and installed apps draw under it). */}
          <div className="absolute top-0 left-0 right-0 z-20 flex gap-0.5 px-2 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] sm:pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] sm:px-4">
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
          <div className="absolute top-[calc(env(safe-area-inset-top,0px)+1.25rem)] sm:top-[calc(env(safe-area-inset-top,0px)+1.75rem)] left-0 right-0 z-20 flex items-center justify-between px-3 sm:px-5">
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
              {isOwnStory && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20 h-8 w-8"
                  onClick={() => { setIsPaused(true); setConfirmDelete(true); }}
                  aria-label="Delete story"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8" onClick={() => setIsPaused(p => !p)} aria-label={isPaused ? "Play" : "Pause"}>
                {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8" onClick={() => setViewerOpen(false)} aria-label="Close">
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* The story: a photo, or a video that plays through once */}
          {activeStory.media_type === "video" ? (
            <video
              key={activeStory.id}
              ref={videoRef}
              src={activeStory.media_url}
              poster={BLANK_POSTER}
              autoPlay
              playsInline
              preload="auto"
              className="max-w-full max-h-full object-contain select-none"
              onPlay={(e) => { if (isPausedRef.current) e.currentTarget.pause(); }}
              onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProgress(Math.min((v.currentTime / v.duration) * 100, 100)); }}
              onEnded={() => goNext()}
              onError={() => goNext()}
              onPointerDown={() => setIsPaused(true)}
              onPointerUp={() => setIsPaused(false)}
            />
          ) : (
            <img
              src={activeStory.media_url}
              alt="Story"
              className="max-w-full max-h-full object-contain select-none"
              onPointerDown={() => setIsPaused(true)}
              onPointerUp={() => setIsPaused(false)}
            />
          )}

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
            <div className="absolute bottom-0 left-0 right-0 z-20 p-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] sm:p-4 sm:pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center gap-1.5 justify-center mb-2">
                {[
                  { emoji: "❤️", type: "love" }, { emoji: "😂", type: "haha" }, { emoji: "😮", type: "wow" },
                  { emoji: "👍", type: "like" }, { emoji: "🔥", type: "fire" }, { emoji: "😢", type: "sad" },
                ].map((r) => (
                  <button key={r.type} onClick={() => handleReaction(r.emoji, r.type)} aria-label={r.type} className="p-0.5 transition-transform hover:scale-125 active:scale-110">
                    <ReactionEmoji type={r.type} className="h-8 w-8 sm:h-9 sm:w-9" />
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
        </div>,
        document.body
      )}

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(open) => { setConfirmDelete(open); if (!open) setIsPaused(false); }}
      >
        {/* Above the full-screen story viewer (z-[100]). */}
        <AlertDialogContent className="z-[110]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this story?</AlertDialogTitle>
            <AlertDialogDescription>It will be removed for everyone. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteStory(); }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default StoriesBar;

interface StoryBubbleProps {
  label: string;
  ariaLabel: string;
  onClick: () => void;
  /** "new": a tangerine ring (not watched yet); "seen": a faint ring; "none": no ring. */
  ring: "new" | "seen" | "none";
  /** Show the + badge that adds a story (on "Your story" with no story yet). */
  add?: boolean;
  /** A + badge that adds another story (on your own bubble when you have one). */
  onAdd?: () => void;
  children: React.ReactNode;
}

/** One round story bubble with the name under it. */
const StoryBubble = ({ label, ariaLabel, onClick, ring, add, onAdd, children }: StoryBubbleProps) => (
  <div className="flex w-[68px] flex-shrink-0 flex-col items-center gap-1">
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={cn(
          "block h-[66px] w-[66px] rounded-full p-[2.5px] transition-transform active:scale-95",
          ring === "new" ? "bg-gradient-to-tr from-amber-400 via-primary to-rose-500" : ring === "seen" ? "bg-border" : "bg-transparent"
        )}
      >
        <span className="block h-full w-full overflow-hidden rounded-full border-[2.5px] border-background bg-background">{children}</span>
      </button>
      {(add || onAdd) && (
        <button
          type="button"
          onClick={onAdd ?? onClick}
          aria-label="Add to your story"
          className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
      )}
    </div>
    <span className="w-full truncate text-center text-[11.5px] font-medium text-foreground/90">{label}</span>
  </div>
);
