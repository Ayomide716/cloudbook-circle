import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Video, Loader2, X } from "lucide-react";

interface VideoUploadProps {
  bucket: string;
  userId: string;
  onUploadComplete: (url: string) => void;
  currentVideo?: string;
  label?: string;
}

const VideoUpload = ({ bucket, userId, onUploadComplete, currentVideo, label = "Upload Video" }: VideoUploadProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentVideo || null);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("video/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a video smaller than 50MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      setPreview(publicUrl);
      onUploadComplete(publicUrl);

      toast({
        title: "Video uploaded successfully",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const clearVideo = () => {
    setPreview(null);
    onUploadComplete("");
  };

  return (
    <div className="space-y-2">
      {preview ? (
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
        <div>
          <Input
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            disabled={isUploading}
            className="hidden"
            id={`video-upload-${bucket}`}
          />
          <label htmlFor={`video-upload-${bucket}`}>
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
        </div>
      )}
    </div>
  );
};

export default VideoUpload;