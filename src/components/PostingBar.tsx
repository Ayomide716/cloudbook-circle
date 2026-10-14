import { Loader2, RotateCcw, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { POSTED_EVENT, dismissPosting, retryPosting, usePostingJobs } from "@/lib/video-jobs";

/**
 * "Posting your reel… 40%": a post or reel whose video is still being prepared or uploaded after
 * Post was tapped. Shown over every screen, just above the tab bar, until it's posted.
 */
const PostingBar = () => {
  const jobs = usePostingJobs();
  useEffect(() => {
    const onPosted = (e: Event) => {
      const label = (e as CustomEvent<{ label?: string }>).detail?.label === "reel" ? "reel" : "post";
      toast({ title: `Your ${label} is live` });
    };
    window.addEventListener(POSTED_EVENT, onPosted);
    return () => window.removeEventListener(POSTED_EVENT, onPosted);
  }, []);
  if (jobs.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-50 mx-auto flex max-w-md flex-col gap-2 md:bottom-6">
      {jobs.map((j) => {
        const what = j.posting?.label === "reel" ? "your reel" : "";
        const failed = j.posting?.failed;
        return (
          <div key={j.id} role="status" className="pointer-events-auto rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
            <div className="flex items-center gap-3">
              <video src={j.preview} muted playsInline preload="metadata" className="h-10 w-10 shrink-0 rounded-lg bg-black object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {failed ? `Couldn't post ${what || "your video"}` : `Posting ${what || "your video"}…`}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {failed
                    ? j.error || "Check your connection and try again."
                    : j.phase === "preparing"
                      ? `Preparing video · ${j.progress}%`
                      : j.phase === "uploading"
                        ? `Uploading · ${j.progress}%`
                        : "Almost done"}
                </p>
              </div>
              {failed ? (
                <>
                  <button type="button" onClick={() => retryPosting(j.id)} className="flex h-8 items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground">
                    <RotateCcw className="h-3.5 w-3.5" /> Try again
                  </button>
                  <button type="button" onClick={() => dismissPosting(j.id)} aria-label="Dismiss" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary">
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              )}
            </div>
            {!failed && <Progress value={j.phase === "done" ? 100 : j.progress} className="mt-2 h-1" />}
          </div>
        );
      })}
    </div>
  );
};

export default PostingBar;
