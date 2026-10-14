import { useState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { uploadMedia, type MediaFolder } from "@/lib/media-upload";
import { shrinkVideo } from "@/lib/video-compress";
import { readVideoInfo } from "@/lib/storage-upload";
import { useToast } from "@/hooks/use-toast";
import { Video, Loader2, X } from "lucide-react";
import { getErrorMessage } from "@/lib/utils";

interface VideoUploadProps {
  bucket: string;
  userId: string;
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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  // "preparing": making the video smaller on the phone; "uploading": sending it.
  const [phase, setPhase] = useState<"preparing" | "uploading">("uploading");
  const [preview, setPreview] = useState<string | null>(currentVideo || null);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;

    // Validate file type
    if (!picked.type.startsWith("video/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Reels are short, as on Facebook: check before spending time on it.
      if (maxSeconds) {
        const { duration } = await readVideoInfo(picked);
        if (duration && duration > maxSeconds + 0.5) {
          toast({
            title: `Reels can be up to ${maxSeconds} seconds`,
            description: `This video is ${Math.round(duration)} seconds. Trim it in your gallery, then try again.`,
            variant: "destructive",
          });
          return;
        }
      }

      // At most 720p, re-encoded on the phone (takes about as long as the video plays).
      setPhase("preparing");
      const file = await shrinkVideo(picked, (f) => setUploadProgress(Math.round(f * 100)));

      if (file.size > 100 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Please upload a video smaller than 100MB",
          variant: "destructive",
        });
        return;
      }

      setPhase("uploading");
      setUploadProgress(0);
      const fileName = `${userId}/${Date.now()}.${file.name.split(".").pop()}`;
      const publicUrl = await uploadMedia(bucket as MediaFolder, fileName, file, setUploadProgress);

      setPreview(publicUrl);
      onUploadComplete(publicUrl);

    } catch (error) {
      toast({
        title: "Upload failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const clearVideo = () => {
    setPreview(null);
    onUploadComplete("");
  };

  return (
    <div className="space-y-2">
      {showPreview && preview ? (
        <div className="relative">
          <video
            src={preview}
            controls
            className="w-full max-h-64 rounded-lg bg-black"
          />
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
            disabled={isUploading}
            className="hidden"
            id={inputId}
          />
          <label htmlFor={inputId} aria-label={label || "Add video"}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-red-500 hover:bg-red-500/10"
              disabled={isUploading}
              asChild
            >
              <span>
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Video className="h-5 w-5" />
                )}
              </span>
            </Button>
          </label>
          {isUploading && (
            <div className="w-full space-y-1">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {phase === "preparing" ? `Preparing video… ${uploadProgress}%` : `Uploading… ${uploadProgress}%`}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VideoUpload;