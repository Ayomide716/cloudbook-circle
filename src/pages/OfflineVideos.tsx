import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import Navigation from "@/components/Navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { offlineObjectUrl, removeOffline, useOfflineVideos, type OfflineVideo } from "@/lib/offline-videos";

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** One saved video, playing from the phone. */
const SavedVideo = ({ video }: { video: OfflineVideo }) => {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    void offlineObjectUrl(video.url).then((u) => { url = u; setSrc(u); });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [video.url]);
  return (
    <div className="feed-section overflow-hidden border border-border/60 bg-card sm:rounded-2xl">
      {src ? <video src={src} controls playsInline preload="metadata" className="aspect-[9/16] max-h-[70vh] w-full bg-black object-contain" /> : <div className="aspect-[9/16] max-h-[70vh] w-full bg-black" />}
      <div className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{video.title}</p>
          <p className="text-xs text-muted-foreground">{mb(video.bytes)} · saved {new Date(video.savedAt).toLocaleDateString()}</p>
        </div>
        <Button variant="secondary" size="sm" className="rounded-full" onClick={() => void removeOffline(video.url)}>
          <Trash2 className="mr-1.5 h-4 w-4" /> Remove
        </Button>
      </div>
    </div>
  );
};

/** Menu → Offline videos: reels saved to the phone, watchable without a connection. */
const OfflineVideos = () => {
  const session = useSession();
  const videos = useOfflineVideos();
  const total = videos.reduce((sum, v) => sum + v.bytes, 0);
  return (
    <div className="min-h-screen bg-background">
      <Navigation currentUserId={session?.user.id} />
      <div className="page-flush mx-auto max-w-xl space-y-2 px-0 pb-24 sm:space-y-4 sm:px-4 sm:py-6">
        <PageHeader back title="Offline videos" subtitle={videos.length ? `${videos.length} saved · ${mb(total)} on this phone` : undefined} />
        {videos.length === 0 ? (
          <EmptyState emoji="bookmark" title="No offline videos yet" text="On a reel, tap ⋯ → Save for offline to watch it later without data." />
        ) : (
          videos.map((v) => <SavedVideo key={v.url} video={v} />)
        )}
      </div>
    </div>
  );
};

export default OfflineVideos;
