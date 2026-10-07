import { useState } from "react";
import { ExternalLink, Globe, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { youTubeId } from "@/lib/links";

/**
 * A card for the first link in a post, as Facebook shows it. YouTube links get the video's
 * thumbnail; other links show the site and path. (Titles and pictures from other sites need a
 * small server function to fetch them; that can come later.)
 */
const LinkPreview = ({ url, className }: { url: string; className?: string }) => {
  const [thumbFailed, setThumbFailed] = useState(false);
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, "");
  const path = decodeURIComponent(u.pathname + u.search).replace(/\/$/, "");
  const videoId = youTubeId(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      onClick={(e) => e.stopPropagation()}
      className={cn("block overflow-hidden rounded-2xl border border-border bg-secondary/40 transition-colors hover:bg-secondary/70", className)}
    >
      {videoId && !thumbFailed && (
        <div className="relative aspect-video bg-black">
          <img
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setThumbFailed(true)}
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-12 w-16 items-center justify-center rounded-2xl bg-[#ff0000] shadow-lg">
              <Play className="h-6 w-6 fill-white text-white" />
            </span>
          </span>
        </div>
      )}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground">
          {videoId ? <Play className="h-4 w-4 fill-current" /> : <Globe className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{videoId ? "YouTube" : host}</span>
          <span className="block truncate text-sm font-semibold">{videoId ? "Watch on YouTube" : path || host}</span>
        </span>
        <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
    </a>
  );
};

export default LinkPreview;
