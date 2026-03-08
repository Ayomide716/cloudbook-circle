import { useState, useRef, useEffect, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ThumbsUp, MessageCircle, Share2, Play, Trash2, Music, Volume2, VolumeX, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

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
}

export default function ReelCard({
  reel, isActive, isMuted, currentUserId,
  onToggleMute, onLike, onComment, onShare, onDelete, onShowUpload, onVideoError,
  onNavigateToProfile, onFollow, isFollowing,
}: ReelCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [doubleTapHeart, setDoubleTapHeart] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const lastTapRef = useRef(0);
  const animFrameRef = useRef<number>(0);

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

  // Progress bar update loop
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
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
  }, [isVisible]);

  const togglePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) { video.play().catch(() => {}); setIsPaused(false); }
    else { video.pause(); setIsPaused(true); }
  }, []);

  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      if (!isLiked) onLike(reel.id);
      setDoubleTapHeart(true);
      setTimeout(() => setDoubleTapHeart(false), 800);
    } else {
      togglePlayPause();
    }
    lastTapRef.current = now;
  }, [isLiked, reel.id, onLike, togglePlayPause]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    video.currentTime = ratio * video.duration;
  };

  const formatCount = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);

  return (
    <div ref={containerRef} className="h-[calc(100vh-56px)] md:h-[calc(100vh-56px)] snap-start flex items-center justify-center relative">
      <div className="relative h-full w-full md:w-[400px] md:max-h-[calc(100vh-80px)] md:rounded-xl md:overflow-hidden md:mx-auto">
        {canPlayInline ? (
          <>
            {/* Only render video element when near viewport */}
            {isVisible && (
              <video
                ref={videoRef}
                src={reel.video_url}
                className="absolute inset-0 w-full h-full object-cover"
                loop
                playsInline
                muted={isMuted}
                preload="metadata"
                onError={() => onVideoError(reel.id)}
                onClick={handleTap}
              />
            )}

            {/* Placeholder when not visible */}
            {!isVisible && (
              <div className="absolute inset-0 bg-black" />
            )}

            {doubleTapHeart && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                <ThumbsUp className="h-24 w-24 text-white fill-white animate-like-heart drop-shadow-2xl" />
              </div>
            )}

            {isPaused && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10" onClick={handleTap}>
                <div className="h-16 w-16 rounded-full bg-black/50 flex items-center justify-center">
                  <Play className="h-8 w-8 text-white ml-1" />
                </div>
              </div>
            )}

            <button onClick={onToggleMute} className="absolute top-4 right-4 z-20 h-9 w-9 rounded-full bg-black/40 flex items-center justify-center">
              {isMuted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
            </button>

            {currentUserId === reel.user_id && (
              <button onClick={() => onDelete(reel.id)} className="absolute top-4 left-4 z-20 h-9 w-9 rounded-full bg-black/40 flex items-center justify-center">
                <Trash2 className="h-4 w-4 text-white" />
              </button>
            )}

            {/* Progress bar */}
            <div className="absolute bottom-0 left-0 right-0 z-20 h-1 cursor-pointer group" onClick={handleSeek}>
              {/* Buffered */}
              <div className="absolute inset-0 bg-white/20 rounded-full" />
              <div className="absolute left-0 top-0 h-full bg-white/40 rounded-full transition-none" style={{ width: `${buffered}%` }} />
              <div className="absolute left-0 top-0 h-full bg-primary rounded-full transition-none group-hover:h-1.5" style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="mx-6 max-w-md rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-white font-semibold">Video can't play</p>
              <p className="mt-1 text-sm text-white/70">Upload a video file instead of a link.</p>
              <Button variant="secondary" className="mt-3" onClick={onShowUpload}>Upload a reel video</Button>
              {currentUserId === reel.user_id && (
                <Button variant="destructive" className="mt-2 w-full" onClick={() => onDelete(reel.id)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Delete this reel
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Bottom gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70 pointer-events-none" />

        {/* Bottom info */}
        <div className="absolute left-4 right-16 bottom-6 z-10 md:bottom-4">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => onNavigateToProfile?.(reel.user_id)} className="flex items-center gap-2 group/profile">
              <Avatar className="h-9 w-9 border-2 border-white group-hover/profile:ring-2 group-hover/profile:ring-primary transition-all">
                <AvatarImage src={reel.profiles.avatar_url || ""} />
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">{reel.profiles.full_name?.[0] || "U"}</AvatarFallback>
              </Avatar>
              <span className="text-white font-semibold text-sm group-hover/profile:underline">{reel.profiles.full_name || "User"}</span>
            </button>
            {currentUserId && currentUserId !== reel.user_id && (
              <button
                onClick={() => onFollow?.(reel.user_id)}
                className={cn(
                  "text-sm px-3 py-0.5 rounded-full border transition-colors",
                  isFollowing
                    ? "border-white/40 text-white/60"
                    : "border-white text-white hover:bg-white/20"
                )}
              >
                {isFollowing ? "Friends" : "· Follow"}
              </button>
            )}
          </div>
          {reel.caption && (
            <p className="text-white/90 text-sm line-clamp-2 drop-shadow-lg">{reel.caption}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Music className="h-3 w-3 text-white" />
            <p className="text-white/70 text-xs">{reel.profiles.full_name} · Original audio</p>
          </div>
        </div>

        {/* Side action buttons */}
        <div className="absolute right-3 bottom-20 md:right-4 md:bottom-auto md:top-1/2 md:-translate-y-1/2 flex flex-col items-center gap-5 z-30">
          <button onClick={() => onLike(reel.id)} className="flex flex-col items-center">
            <div className={cn("h-11 w-11 rounded-full flex items-center justify-center transition-transform active:scale-90", isLiked ? "bg-primary/20" : "bg-black/40")}>
              <ThumbsUp className={cn("h-6 w-6 transition-colors", isLiked ? "fill-primary text-primary" : "text-white")} />
            </div>
            <span className="text-white text-xs mt-1 font-medium drop-shadow-lg">{formatCount(reel.reel_likes.length)}</span>
          </button>

          <button onClick={() => onComment(reel.id)} className="flex flex-col items-center">
            <div className="h-11 w-11 rounded-full bg-black/40 flex items-center justify-center transition-transform active:scale-90">
              <MessageCircle className="h-6 w-6 text-white" />
            </div>
            <span className="text-white text-xs mt-1 font-medium drop-shadow-lg">{formatCount(reel.reel_comments.length)}</span>
          </button>

          <button onClick={() => onShare(reel.id)} className="flex flex-col items-center">
            <div className="h-11 w-11 rounded-full bg-black/40 flex items-center justify-center transition-transform active:scale-90">
              <Share2 className="h-6 w-6 text-white" />
            </div>
            <span className="text-white text-xs mt-1 font-medium drop-shadow-lg">Share</span>
          </button>

          <button className="flex flex-col items-center">
            <div className="h-11 w-11 rounded-full bg-black/40 flex items-center justify-center">
              <MoreHorizontal className="h-6 w-6 text-white" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
