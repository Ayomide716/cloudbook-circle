import { useEffect, useRef, useState } from "react";
import { playSound } from "@/lib/sounds";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, X, MapPin, Globe, BarChart3 } from "lucide-react";
import { ImagesSquare } from "@phosphor-icons/react";
import TagFriends, { type TaggedFriend } from "@/components/TagFriends";
import { previewsFor } from "@/lib/photo-previews";
import { rememberPostTags } from "@/lib/post-tags";
import { Input } from "@/components/ui/input";
import PostExpirySelector from "./PostExpirySelector";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import VideoUpload from "./VideoUpload";
import VideoJobStatus from "./VideoJobStatus";
import { POSTED_EVENT, cancelVideoJob, isVideoJobRef, postWhenReady, useVideoJob } from "@/lib/video-jobs";
import PollCreator from "./PollCreator";
import MultiImageUpload from "./MultiImageUpload";
import MentionInput from "./MentionInput";
import { cn } from "@/lib/utils";
import { BACKGROUND_MAX_LENGTH, POST_BACKGROUNDS, backgroundCss } from "@/lib/post-backgrounds";
import { features } from "@/lib/features";
import {
  Dialog,
  DialogClose,
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
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [pollData, setPollData] = useState<{ question: string; options: string[] } | null>(null);
  const [postExpiry, setPostExpiry] = useState<string | null>(null);
  const [background, setBackground] = useState<string | null>(null);
  // "Lekki, Lagos": shown on the post as "Lekki, Lagos · 2h", as on Facebook.
  const [location, setLocation] = useState("");
  const [showLocation, setShowLocation] = useState(false);
  const [tagged, setTagged] = useState<TaggedFriend[]>([]);
  const { toast } = useToast();
  // A picked video is prepared and uploaded in the background (lib/video-jobs).
  const videoJob = useVideoJob(videoUrl);
  const removeVideo = () => {
    if (isVideoJobRef(videoUrl)) cancelVideoJob(videoUrl);
    setVideoUrl("");
  };
  // A post whose video finished in the background: show it in the feed.
  useEffect(() => {
    const onPosted = (e: Event) => {
      if ((e as CustomEvent<{ label?: string }>).detail?.label !== "post") return;
      playSound("post");
      onPostCreated();
    };
    window.addEventListener(POSTED_EVENT, onPosted);
    return () => window.removeEventListener(POSTED_EVENT, onPosted);
  }, [onPostCreated]);
  // The top bar's "+" opens the composer from anywhere (via /?compose=1).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("compose") !== "1") return;
    setShowDialog(true);
    const next = new URLSearchParams(searchParams);
    next.delete("compose");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // The post on its way up, shown under the composer pill until it's saved.
  const [pending, setPending] = useState<{
    content: string;
    image: string | null;
    video: boolean;
    failed: boolean;
    draft: { content: string; imageUrls: string[]; videoUrl: string; pollData: { question: string; options: string[] } | null; postExpiry: string | null; location: string; showLocation: boolean };
  } | null>(null);

  /** Puts a post that failed back in the composer to try again. */
  const retryPending = () => {
    if (!pending) return;
    const d = pending.draft;
    setContent(d.content); setImageUrls(d.imageUrls); setVideoUrl(d.videoUrl); setPollData(d.pollData);
    setPostExpiry(d.postExpiry); setLocation(d.location); setShowLocation(d.showLocation);
    setPending(null);
    setShowDialog(true);
  };

  // Coloured backgrounds are for short text on its own (no photo, video or poll).
  const canUseBackground = imageUrls.length === 0 && !videoUrl && !pollData && content.length <= BACKGROUND_MAX_LENGTH;
  const bgCss = canUseBackground ? backgroundCss(background) : null;

  // A second tap can land before React disables the button; the ref blocks it at once.
  const submittingRef = useRef(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    
     if (!content.trim() && !pollData) {
      toast({
        title: "Content required",
        description: "Please write something to post",
        variant: "destructive",
      });
      return;
    }

    // Calculate expires_at from post expiry setting
    let expiresAt: string | null = null;
    if (postExpiry === "24h") expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    else if (postExpiry === "7d") expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    else if (postExpiry === "30d") expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const text = content.trim() || (pollData ? `📊 ${pollData.question}` : "");
    const poll = pollData;
    const place = location.trim() || null;
    const bg = bgCss ? background : null;
    const images = imageUrls;
    const tags = tagged;
    const save = async (finalVideoUrl: string | null) => {
      const { data: postData, error } = await supabase
        .from("posts")
        .insert({
          content: text,
          user_id: currentUser.id,
          // image_url is the cover (profile photo grids, link previews); image_urls has them all.
          image_url: images[0] ?? null,
          image_urls: images,
          ...(bg ? { background: bg } : {}),
          video_url: finalVideoUrl,
          ...(features.postLocation ? { location: place } : {}),
          expires_at: expiresAt,
        })
        .select()
        .single();
      if (error) throw error;
      // Extras saved after the post itself, so a database without them still posts fine.
      const previews = previewsFor(images);
      if (postData && previews.some(Boolean)) {
        await supabase.from("posts").update({ image_previews: previews }).eq("id", postData.id);
      }
      if (postData && tags.length) {
        const { error: tagError } = await supabase.from("post_tags").insert(tags.map((t) => ({ post_id: postData.id, user_id: t.id })));
        if (!tagError) rememberPostTags(postData.id, tags);
      }
      if (postData && poll) {
        await supabase.from("polls").insert({
          post_id: postData.id,
          question: poll.question,
          options: poll.options,
          user_id: currentUser.id,
        });
      }
    };

    const resetComposer = () => {
      setContent("");
      setImageUrls([]);
      setVideoUrl("");
      setPollData(null);
      setPostExpiry(null);
      setBackground(null);
      setLocation("");
      setShowLocation(false);
      setTagged([]);
      setShowDialog(false);
    };

    // The video is still being prepared or uploaded: post it when it's up, from the background
    // (the "Posting…" bar shows how it's going), and free the composer now.
    if (isVideoJobRef(videoUrl) && !videoJob?.url) {
      postWhenReady(videoUrl, "post", (url) => save(url));
      resetComposer();
      return;
    }
    const finalVideoUrl = (isVideoJobRef(videoUrl) ? videoJob?.url : videoUrl) || null;

    submittingRef.current = true;
    setIsLoading(true);

    // Close the composer at once and show the post going up at the top of the feed, with a
    // progress bar, instead of making you wait in the composer.
    const draft = { content, imageUrls, videoUrl: finalVideoUrl ?? "", pollData, postExpiry, location, showLocation };
    setPending({ content: text, image: imageUrls[0] ?? null, video: !!finalVideoUrl, failed: false, draft });
    setShowDialog(false);

    let failed = false;
    try {
      await save(finalVideoUrl);
    } catch {
      failed = true;
    }

    setIsLoading(false);
    submittingRef.current = false;

    if (failed) {
      setPending((p) => (p ? { ...p, failed: true } : p));
      return;
    }

    setPending(null);
    resetComposer();
    playSound("post");
    onPostCreated();
  };
 
   const handleCreatePoll = (question: string, options: string[]) => {
     setPollData({ question, options });
     setContent(`📊 ${question}`);
   };

  return (
    <>
      {/* Compact Create Post Card */}
      {/* One rounded pill on phones: photo, prompt, photo icon. */}
      <Card className="feed-section p-3 sm:p-4 shadow-sm max-sm:!rounded-full max-sm:p-1.5 max-sm:pr-2.5">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0">
            <AvatarImage src={currentUser.avatar_url || undefined} />
            <AvatarFallback className="bg-secondary text-secondary-foreground">
              {currentUser.full_name?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          
          <button
            onClick={() => setShowDialog(true)}
            className="flex-1 min-w-0 h-9 sm:h-10 text-left px-1 sm:px-4 sm:bg-secondary sm:hover:bg-secondary/80 rounded-full text-muted-foreground transition-colors text-[14.5px] sm:text-base truncate"
          >
            {/* Long names don't fit on a phone; the shorter prompt reads better than a cut-off name. */}
            <span className="sm:hidden">What's on your mind?</span>
            <span className="hidden sm:inline">What's on your mind, {currentUser.full_name?.split(' ')[0] || 'there'}?</span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 flex-shrink-0 rounded-full text-emerald-500 hover:bg-emerald-500/10 [&_svg]:size-6"
            onClick={() => setShowDialog(true)}
            aria-label="Add photos or video"
          >
            {/* Green, as on Facebook, so it reads as "add a photo". */}
            <ImagesSquare weight="fill" />
          </Button>
        </div>
      </Card>

      {pending && (
        <Card className="feed-section overflow-hidden" role="status" aria-live="polite">
          <div className="flex items-center gap-3 p-3">
            <Avatar className="h-9 w-9 flex-shrink-0">
              <AvatarImage src={currentUser.avatar_url || undefined} />
              <AvatarFallback className="bg-secondary text-secondary-foreground">{currentUser.full_name?.[0]?.toUpperCase() || "U"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">{pending.failed ? "Couldn't post" : "Posting…"}</p>
              <p className="truncate text-[13px] text-muted-foreground">{pending.failed ? "Check your connection and try again." : pending.content || (pending.video ? "Video" : "Photo")}</p>
            </div>
            {pending.image && <img src={pending.image} alt="" className="h-11 w-11 flex-shrink-0 rounded-lg object-cover" />}
            {pending.failed && (
              <div className="flex flex-shrink-0 gap-1">
                <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => setPending(null)}>Discard</Button>
                <Button size="sm" className="h-8 rounded-full" onClick={retryPending}>Retry</Button>
              </div>
            )}
          </div>
          {!pending.failed && (
            <div className="h-1 w-full overflow-hidden bg-secondary">
              <div className="h-full w-full origin-left animate-post-progress bg-primary" />
            </div>
          )}
        </Card>
      )}

      {/* Full Create Post Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        {/* Phones: a full page, like Facebook's "New post" (✕ on the left, title in the middle);
            bigger screens: a centred window. */}
        <DialogContent className="sm:max-w-lg max-sm:top-0 max-sm:h-[calc(100dvh-var(--keyboard-inset,0px))] max-sm:max-h-none max-sm:content-start max-sm:rounded-none max-sm:border-0 max-sm:pt-[env(safe-area-inset-top)] max-sm:[&>button:last-child]:hidden max-sm:flex max-sm:flex-col max-sm:gap-0 max-sm:overflow-hidden max-sm:pb-0">
          <DialogHeader className="max-sm:-mx-4 max-sm:h-14 max-sm:flex-row max-sm:items-center max-sm:space-y-0 max-sm:border-b max-sm:border-border max-sm:px-2">
            <DialogClose asChild>
              <button type="button" className="sm:hidden flex h-10 w-10 items-center justify-center rounded-full hover:bg-secondary" aria-label="Close">
                <X className="h-6 w-6" />
              </button>
            </DialogClose>
            <DialogTitle className="max-sm:flex-1 max-sm:text-center max-sm:text-[17px]">Create post</DialogTitle>
            {/* Phones: Post sits top-right, as on Facebook, so the keyboard never hides it. */}
            <Button
              type="submit"
              form="create-post"
              size="sm"
              className="sm:hidden h-9 rounded-full px-4 font-semibold disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100"
              disabled={isLoading || (!content.trim() && !pollData)}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Post"}
            </Button>
          </DialogHeader>
          
          <form id="create-post" onSubmit={handleSubmit} className="space-y-4 max-sm:flex max-sm:min-h-0 max-sm:flex-1 max-sm:flex-col max-sm:space-y-0">
            {/* What you're writing and what's attached; scrolls on its own on phones. */}
            <div className="space-y-4 max-sm:-mx-4 max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-y-auto max-sm:px-4 max-sm:py-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={currentUser.avatar_url || undefined} />
                <AvatarFallback>
                  {currentUser.full_name?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold leading-tight">{currentUser.full_name || "Anonymous"}</p>
                {/* Posts on Ember are public; shown as Facebook shows the audience. */}
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="inline-flex h-6 items-center gap-1 rounded-md bg-secondary px-2 text-xs font-semibold text-muted-foreground">
                    <Globe className="h-3 w-3" /> Public
                  </span>
                  <PostExpirySelector value={postExpiry} onChange={setPostExpiry} />
                </div>
              </div>
            </div>

            {/* On a coloured background, the text is big and centred as it will be on the post. */}
            <div
              className={cn(bgCss && "flex min-h-[230px] items-center rounded-2xl px-5 py-6")}
              style={bgCss ? { backgroundImage: bgCss } : undefined}
            >
              <MentionInput
                placeholder={`What's on your mind, ${currentUser.full_name?.split(' ')[0] || 'there'}? Use @ to mention friends`}
                value={content}
                onChange={setContent}
                className={cn(
                  // A little room on the sides so the first letter isn't clipped at the edge.
                  "resize-none border-0 focus-visible:ring-0 px-1 py-0",
                  bgCss
                    ? "min-h-[80px] w-full bg-transparent text-center text-2xl font-bold text-white placeholder:text-white/70"
                    : imageUrls.length || videoUrl || pollData
                      ? "min-h-[56px] text-lg placeholder:text-muted-foreground/60" // the attachment sits right under the words
                      : "min-h-[120px] max-sm:min-h-[22dvh] text-lg placeholder:text-muted-foreground/60"
                )}
                disabled={isLoading}
              />
            </div>

            {/* Backgrounds for short text posts, as on Facebook */}
            {canUseBackground && (
              // Padding inside the scroller so the selected ring isn't cut off at the edges.
              <div className="-mx-1 -mt-1 flex items-center gap-2 overflow-x-auto px-1.5 py-1.5 scrollbar-hide" role="radiogroup" aria-label="Background">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!background}
                  aria-label="No background"
                  onClick={() => setBackground(null)}
                  className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border text-xs font-bold", !background ? "border-primary ring-2 ring-primary" : "border-border")}
                >
                  Aa
                </button>
                {POST_BACKGROUNDS.map((bg) => (
                  <button
                    key={bg.key}
                    type="button"
                    role="radio"
                    aria-checked={background === bg.key}
                    aria-label={`${bg.label} background`}
                    onClick={() => setBackground(bg.key)}
                    className={cn("h-8 w-8 flex-shrink-0 rounded-lg", background === bg.key && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
                    style={{ backgroundImage: bg.css }}
                  />
                ))}
              </div>
            )}

            {tagged.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="text-muted-foreground">with</span>
                {tagged.map((t) => (
                  <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 py-1 pl-2.5 pr-1 font-medium text-sky-700 dark:text-sky-300">
                    {t.full_name || "Friend"}
                    <button type="button" onClick={() => setTagged(tagged.filter((x) => x.id !== t.id))} aria-label={`Untag ${t.full_name || "friend"}`} className="rounded-full p-0.5 hover:bg-sky-500/20">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {features.postLocation && (showLocation || location) && (
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-red-500" />
                <Input
                  aria-label="Location"
                  placeholder="Where are you? e.g. Lekki, Lagos"
                  value={location}
                  maxLength={80}
                  onChange={(e) => setLocation(e.target.value)}
                  className="pl-9 pr-9 rounded-full"
                  autoFocus={showLocation && !location}
                />
                {location && (
                  <button
                    type="button"
                    onClick={() => { setLocation(""); setShowLocation(false); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-secondary"
                    aria-label="Remove location"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

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
                 <p className="font-medium text-sm mb-2 flex items-center gap-1.5"><BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />{pollData.question}</p>
                 <div className="space-y-1">
                   {pollData.options.map((opt, i) => (
                     <div key={i} className="bg-secondary rounded-lg px-3 py-2 text-sm">
                       {opt}
                     </div>
                   ))}
                 </div>
               </div>
             )}
 
            {/* One preview area for whatever is attached: the whole photo (not cropped), a grid
                for several photos, or the video. Each item can be removed. */}
            {videoUrl && (
              <div className="relative rounded-xl overflow-hidden bg-muted">
                <video src={videoJob?.preview ?? videoUrl} className="w-full max-h-80 bg-black" controls playsInline preload="metadata" />
                <VideoJobStatus job={videoJob} className="px-3 py-2" />
                <button
                  type="button"
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/75 transition-colors"
                  onClick={removeVideo}
                  aria-label="Remove video"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {imageUrls.length === 1 && (
              <div className="relative rounded-xl overflow-hidden bg-muted">
                <img src={imageUrls[0]} alt="Attached photo" className="w-full max-h-80 object-contain" />
                <button
                  type="button"
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/75 transition-colors"
                  onClick={() => setImageUrls([])}
                  aria-label="Remove photo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {imageUrls.length > 1 && (
              <div className={cn("grid gap-2", imageUrls.length === 2 || imageUrls.length === 4 ? "grid-cols-2" : "grid-cols-3")}>
                {imageUrls.map((url, i) => (
                  <div key={url} className="relative aspect-square rounded-xl overflow-hidden bg-muted">
                    <img src={url} alt={`Attached photo ${i + 1}`} className="h-full w-full object-cover" />
                    {i === 0 && (
                      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white">Cover</span>
                    )}
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/75 transition-colors"
                      onClick={() => setImageUrls((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove photo ${i + 1}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            </div>

            {/* Phones: pinned to the bottom of the screen, above the keyboard. */}
            <div className="flex items-center justify-between rounded-lg border p-3 max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0 max-sm:border-b-0 max-sm:px-4 max-sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <span className="text-sm font-medium">Add to your post</span>
              <div className="flex gap-1">
                <MultiImageUpload
                  bucket="post-images"
                  userId={currentUser.id}
                  onUploadComplete={(urls) => { setImageUrls(urls); if (urls.length > 0) removeVideo(); }}
                  currentImages={imageUrls}
                  showPreview={false}
                />
                <VideoUpload
                  bucket="post-videos"
                  userId={currentUser.id}
                  onUploadComplete={(url) => { setVideoUrl(url); if (url) setImageUrls([]); }}
                  currentVideo={videoUrl}
                  label="Add video"
                  showPreview={false}
                />
                <PollCreator onCreatePoll={handleCreatePoll} />
                <TagFriends userId={currentUser.id} value={tagged} onChange={setTagged} />
                {features.postLocation && <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn("h-9 w-9 rounded-full text-red-500 hover:bg-red-500/10", (showLocation || location) && "bg-red-500/10")}
                  onClick={() => setShowLocation((v) => !v)}
                  aria-label="Add location"
                  aria-expanded={showLocation}
                >
                  <MapPin className="h-5 w-5" />
                </Button>}
              </div>
            </div>

            {/* Stays visible at the bottom of the sheet, even with a long post or the keyboard open. */}
            <div className="max-sm:hidden sticky -bottom-6 -mx-6 -mb-6 px-6 pt-2 pb-6 bg-background border-t border-border/50">
              {/* Until there's something to post, the button is plainly grey (not a faded orange). */}
              <Button
                type="submit"
                className="h-11 w-full rounded-full text-[15px] font-semibold disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100"
                disabled={isLoading || (!content.trim() && !pollData)}
              >
                {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Post
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CreatePost;