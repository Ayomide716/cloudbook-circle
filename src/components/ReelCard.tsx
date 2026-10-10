import { useState, useRef, useEffect, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Play, Trash2, Volume2, VolumeX, Link2, Flag, VideoOff } from "lucide-react";
import { ChatCircle, DotsThree, Heart, MusicNotesSimple, ShareFat } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import ReactionEmoji from "./reactions/ReactionEmoji";
import { cn } from "@/lib/utils";
import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from "@/components/ui/action-menu";
import { useToast } from "@/hooks/use-toast";
import HeartBurst from "./HeartBurst";
import { haptic } from "@/lib/haptics";
import ReportDialog from "@/components/ReportDialog";

interface ReelCardProps {
  reel: {
    id: string;
    video_url: string;
    caption: string | null;
    user_id: string;
    profiles: { full_name: string | null; avatar_url: string | null };
    reel_likes: { user_id: string }[];
    reel_comments: { id: string }[];
  };
  isActive: boolean;
  isMuted: boolean;
  currentUserId: string | null;
  onToggleMute: () => void;
  onLike: (id: string) => void;
  onComment: (id: string) => void;
  onShare: (id: string) => void;
  onDelete: (id: string) => void;
  onShowUpload: () => void;
  onVideoError: (id: string) => void;
  onNavigateToProfile?: (userId: string) => void;
  onFollow?: (userId: string) => void;
  isFollowing?: boolean;
  isPending?: boolean;
}

export default function ReelCard({
  reel, isActive, isMuted, currentUserId,
  onToggleMute, onLike, onComment, onShare, onDelete, onShowUpload, onVideoError,
  onNavigateToProfile, onFollow, isFollowing, isPending,
}: ReelCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Tall videos fill the screen; wider ones (landscape, square) show whole and centred on
  // black, as on TikTok, so nothing gets cropped off.
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [heartBurst, setHeartBurst] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const lastTapRef = useRef(0);
  const animFrameRef = useRef<number>(0);
  const { toast } = useToast();

  const isLiked = reel.reel_likes.some(l => l.user_id === currentUserId);
  const isTikTokLink = /tiktok\.com|vt\.tiktok\.com/i.test(reel.video_url);
  const isPublicStorageUrl = reel.video_url.includes("/storage/v1/object/public/");
  const canPlayInline = !isTikTokLink && isPublicStorageUrl;

  // Lazy load: only set video src when near viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      { rootMargin: "200px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Play/pause based on active state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = isMuted;
    if (isActive && isVisible) {
      video.play().catch(() => {});
      setIsPaused(false);
    } else {
      video.pause();
    }
  }, [isActive, isMuted, isVisible]);

  // Progress bar update loop (only for the reel on screen)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isActive) return;
    const update = () => {
      if (video.duration) {
        setProgress((video.currentTime / video.duration) * 100);
        if (video.buffered.length > 0) {
          setBuffered((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
        }
      }
      animFrameRef.current = requestAnimationFrame(update);
    };
    animFrameRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isVisible, isActive]);

  const onMetadata = () => {
    const video = videoRef.current;
    const box = containerRef.current?.firstElementChild as HTMLElement | null;
    if (!video?.videoWidth || !video.videoHeight || !box?.clientHeight) return;
    const videoRatio = video.videoWidth / video.videoHeight;
    const boxRatio = box.clientWidth / box.clientHeight;
    // Cover only when cropping would cut off less than about a fifth of the picture.
    setFit(videoRatio <= boxRatio * 1.25 ? "cover" : "contain");
  };


  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { video.play().catch(() => {}); setIsPaused(false); }
    else { video.pause(); setIsPaused(true); }
  }, []);

  // A single tap pauses; a double tap likes. Wait briefly before pausing so a double tap
  // doesn't also pause the video.
  const singleTapTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(singleTapTimer.current), []);
  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      clearTimeout(singleTapTimer.current);
      if (!isLiked) onLike(reel.id);
      else haptic(12);
      setHeartBurst((n) => n + 1);
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
    singleTapTimer.current = setTimeout(togglePlayPause, 260);
  }, [isLiked, reel.id, onLike, togglePlayPause]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    video.currentTime = ratio * video.duration;
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/reels/${reel.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied!" });
    } catch {
      toast({ title: "Couldn't copy the link", description: url });
    }
  };

  const formatCount = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
  const [captionOpen, setCaptionOpen] = useState(false);
  const name = reel.profiles.full_name || "User";

  const followLabel = isFollowing ? "Friends" : isPending ? "Requested" : "Add friend";

  // The glassy round buttons down the right edge, as on Instagram and TikTok.
  const railButton = "flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20";

  return (
    <div ref={containerRef} className="h-[100dvh] md:h-[calc(100dvh-57px)] snap-start snap-always flex items-center justify-center relative">
      <div className="relative h-full w-full overflow-hidden bg-black md:w-[420px] md:max-h-[calc(100dvh-80px)] md:rounded-[28px] md:mx-auto md:ring-1 md:ring-white/10">
        {canPlayInline ? (
          <>
            {isVisible && (
              <>
              <video
                ref={videoRef}
                src={reel.video_url}
                onLoadedMetadata={onMetadata}
                className={cn("absolute inset-0 h-full w-full", fit === "cover" ? "object-cover" : "object-contain object-center")}
                loop
                playsInline
                muted={isMuted}
                preload="metadata"
                onError={() => onVideoError(reel.id)}
                onClick={handleTap}
              />
              </>
            )}

            {!isVisible && <div className="absolute inset-0 bg-black" />}

            {heartBurst > 0 && (
              <div className="pointer-events-none absolute inset-0 z-30">
                <HeartBurst key={heartBurst} />
              </div>
            )}

            <AnimatePresence>
              {isPaused && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 flex items-center justify-center bg-black/25"
                  onClick={handleTap}
                >
                  <motion.div
                    initial={{ scale: 1.6 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 380, damping: 22 }}
                    className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-white/20 bg-white/15 backdrop-blur-md"
                  >
                    <Play className="ml-1 h-8 w-8 fill-white text-white" />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={onToggleMute}
              aria-label={isMuted ? "Turn sound on" : "Mute"}
              className="absolute right-4 top-[calc(env(safe-area-inset-top)+4rem)] z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/30 backdrop-blur-md md:top-4"
            >
              {isMuted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
            </button>

            {/* Progress: a hairline that thickens when you touch it to scrub. */}
            <div className="group absolute inset-x-0 bottom-0 z-20 flex h-4 cursor-pointer items-end" onClick={handleSeek}>
              <div className="relative h-[3px] w-full bg-white/20 transition-all group-hover:h-[5px]">
                <div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${buffered}%` }} />
                <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </>
        ) : (
          // A link that can't play here: a plain black screen that says so, instead of an error box.
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="relative mx-8 flex flex-col items-center text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-white/10 backdrop-blur-md">
                <VideoOff className="h-7 w-7 text-white/80" />
              </span>
              <p className="mt-4 font-display text-lg font-bold text-white">This reel can't play here</p>
              <p className="mt-1 text-sm text-white/65">It was shared as a link. Reels uploaded from a phone play right here.</p>
              <div className="mt-5 flex gap-2">
                <Button className="rounded-full" onClick={onShowUpload}>Upload a reel</Button>
                {currentUserId === reel.user_id && (
                  <Button variant="secondary" className="rounded-full bg-white/10 text-white hover:bg-white/20" onClick={() => onDelete(reel.id)}>
                    <Trash2 className="mr-1.5 h-4 w-4" /> Delete
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Shade top and bottom so the white text always reads. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/50 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

        {/* Who made it, the caption and the sound. */}
        <div className="absolute bottom-7 left-4 right-[76px] z-10 md:bottom-5">
          <div className="mb-2.5 flex items-center gap-2.5">
            <button onClick={() => onNavigateToProfile?.(reel.user_id)} className="flex min-w-0 items-center gap-2.5">
              <Avatar className="h-10 w-10 ring-2 ring-white/90">
                <AvatarImage src={reel.profiles.avatar_url || ""} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">{name[0]}</AvatarFallback>
              </Avatar>
              <span className="truncate text-[15px] font-semibold text-white">{name}</span>
            </button>
            {currentUserId && currentUserId !== reel.user_id && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                // Already friends: just a label (unfriending belongs on their profile, not one tap away).
                onClick={() => !isFollowing && onFollow?.(reel.user_id)}
                disabled={isFollowing}
                className={cn(
                  "shrink-0 rounded-full px-3.5 py-1 text-[13px] font-semibold transition-colors",
                  isFollowing
                    ? "border border-white/30 text-white/70"
                    : isPending
                    ? "border border-white/30 bg-white/10 text-white/80"
                    : "bg-primary text-primary-foreground"
                )}
              >
                {followLabel}
              </motion.button>
            )}
          </div>
          {reel.caption && (
            <button type="button" onClick={() => setCaptionOpen((o) => !o)} className="block text-left">
              <p className={cn("text-[14px] leading-snug text-white/95", !captionOpen && "line-clamp-2")}>{reel.caption}</p>
            </button>
          )}
          {/* The sound, scrolling past in a little pill. */}
          <div className="mt-3 flex max-w-[220px] items-center gap-2 overflow-hidden rounded-full bg-white/10 py-1 pl-2.5 pr-3 backdrop-blur-md">
            <MusicNotesSimple className="h-3.5 w-3.5 shrink-0 text-white" weight="bold" />
            <div className="relative min-w-0 flex-1 overflow-hidden">
              <p className={cn("inline-block whitespace-nowrap text-xs text-white/85", isActive && !isPaused && "animate-marquee")}>{name} · Original audio</p>
            </div>
          </div>
        </div>

        {/* Side actions */}
        <div className="absolute bottom-8 right-3 z-30 flex flex-col items-center gap-4 md:bottom-6">
          <button onClick={() => onLike(reel.id)} className="flex flex-col items-center" aria-label={isLiked ? "Unlike" : "Like"} aria-pressed={isLiked}>
            <motion.span whileTap={{ scale: 0.82 }} className={railButton}>
              <AnimatePresence mode="wait" initial={false}>
                {isLiked ? (
                  <motion.span key="on" initial={{ scale: 0.2, rotate: -25 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }} transition={{ type: "spring", stiffness: 600, damping: 13 }}>
                    <ReactionEmoji type="love" className="h-7 w-7" />
                  </motion.span>
                ) : (
                  <motion.span key="off" initial={{ scale: 0.6 }} animate={{ scale: 1 }} exit={{ scale: 0.6 }}>
                    <Heart className="h-7 w-7" weight="bold" />
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.span>
            <span className="mt-1 text-xs font-semibold text-white">{formatCount(reel.reel_likes.length)}</span>
          </button>

          <button onClick={() => onComment(reel.id)} className="flex flex-col items-center" aria-label="Comments">
            <motion.span whileTap={{ scale: 0.82 }} className={railButton}>
              <ChatCircle className="h-7 w-7" weight="bold" />
            </motion.span>
            <span className="mt-1 text-xs font-semibold text-white">{formatCount(reel.reel_comments.length)}</span>
          </button>

          <button onClick={() => onShare(reel.id)} className="flex flex-col items-center" aria-label="Share">
            <motion.span whileTap={{ scale: 0.82 }} className={railButton}>
              <ShareFat className="h-7 w-7" weight="bold" />
            </motion.span>
            <span className="mt-1 text-xs font-semibold text-white">Share</span>
          </button>

          <ActionMenu>
            <ActionMenuTrigger asChild>
              <button className={railButton} aria-label="More options">
                <DotsThree className="h-7 w-7" weight="bold" />
              </button>
            </ActionMenuTrigger>
            <ActionMenuContent side="left" align="end" className="w-48">
              <ActionMenuItem onClick={handleCopyLink}>
                <Link2 className="h-4 w-4 mr-2" /> Copy link
              </ActionMenuItem>
              {currentUserId && currentUserId !== reel.user_id && (
                <ActionMenuItem onSelect={() => setReportOpen(true)}>
                  <Flag className="h-4 w-4 mr-2" /> Report reel
                </ActionMenuItem>
              )}
              {currentUserId === reel.user_id && (
                <ActionMenuItem onSelect={() => onDelete(reel.id)} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" /> Delete reel
                </ActionMenuItem>
              )}
            </ActionMenuContent>
          </ActionMenu>

          {/* The spinning record with their photo, as on TikTok: it turns while the reel plays. */}
          <button onClick={() => onNavigateToProfile?.(reel.user_id)} aria-label={`${name}'s profile`} className="mt-1">
            <span
              className={cn("flex h-11 w-11 items-center justify-center rounded-full bg-[conic-gradient(from_0deg,#111,#3a3a3a,#111,#3a3a3a,#111)] p-[7px] ring-1 ring-white/20", "animate-[spin_6s_linear_infinite]", (!isActive || isPaused) && "[animation-play-state:paused]")}
            >
              <Avatar className="h-full w-full">
                <AvatarImage src={reel.profiles.avatar_url || ""} />
                <AvatarFallback className="bg-primary text-[10px] text-primary-foreground">{name[0]}</AvatarFallback>
              </Avatar>
            </span>
          </button>
          {currentUserId && currentUserId !== reel.user_id && (
            <ReportDialog reportedType="reel" reportedId={reel.id} currentUserId={currentUserId} open={reportOpen} onOpenChange={setReportOpen} />
          )}
        </div>
      </div>
    </div>
  );
}
