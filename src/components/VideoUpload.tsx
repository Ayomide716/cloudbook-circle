import { useState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MediaFolder } from "@/lib/media-upload";
import { cancelVideoJob, isVideoJobRef, startVideoJob, useVideoJob } from "@/lib/video-jobs";
import { readVideoInfo } from "@/lib/storage-upload";
import { useToast } from "@/hooks/use-toast";
import { Video, Loader2, X } from "@/components/icons";
import VideoJobStatus from "@/components/VideoJobStatus";

interface VideoUploadProps {
  bucket: string;
  userId: string;
  /** Gets the video's address, or a "videojob:…" reference while it's still being prepared and uploaded (lib/video-jobs). */
  onUploadComplete: (url: string) => void;
  currentVideo?: string;
  /** Set false when the parent renders its own preview (e.g. the post composer). */
  showPreview?: boolean;
  label?: string;
  /** Longest video accepted, in seconds (reels: 60). */
  maxSeconds?: number;
}

const VideoUpload = ({ bucket, userId, onUploadComplete, currentVideo, label = "Upload Video", showPreview = true, maxSeconds }: VideoUploadProps) => {
  const inputId = `video-upload-${bucket}-${useId()}`;
  const [checking, setChecking] = useState(false);
  const job = useVideoJob(currentVideo);
  const preview = job?.preview ?? (currentVideo || null);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;

    if (!picked.type.startsWith("video/")) {
      toast({ title: "Invalid file type", description: "Please upload a video file", variant: "destructive" });
      return;
    }

    // Reels are short, as on Facebook: check before spending time on it.
    if (maxSeconds) {
      setChecking(true);
      const { duration } = await readVideoInfo(picked);
      setChecking(false);
      if (duration && duration > maxSeconds + 0.5) {
        toast({
          title: `Reels can be up to ${maxSeconds} seconds`,
          description: `This video is ${Math.round(duration)} seconds. Trim it in your gallery, then try again.`,
          variant: "destructive",
        });
        return;
      }
    }

    // Making it smaller and uploading start now, in the background, while you write the caption.
    if (isVideoJobRef(currentVideo)) cancelVideoJob(currentVideo);
    onUploadComplete(startVideoJob(picked, bucket as MediaFolder, userId));
  };

  const clearVideo = () => {
    if (isVideoJobRef(currentVideo)) cancelVideoJob(currentVideo);
    onUploadComplete("");
  };

  return (
    <div className="space-y-2">
      {showPreview && preview ? (
        <div className="relative">
          <video
            src={preview}
            controls
            playsInline
            className="w-full max-h-64 rounded-lg bg-black"
          />
          <VideoJobStatus job={job} className="mt-1" />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2"
            onClick={clearVideo}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            disabled={checking}
            className="hidden"
            id={inputId}
          />
          <label htmlFor={inputId} aria-label={label || "Add video"}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-foreground hover:bg-secondary"
              disabled={checking}
              asChild
            >
              <span>
                {checking ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Video className="h-5 w-5" />
                )}
              </span>
            </Button>
          </label>
        </div>
      )}
    </div>
  );
};

export default VideoUpload;