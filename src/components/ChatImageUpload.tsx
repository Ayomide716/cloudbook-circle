import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Image, Video, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChatMediaUploadProps {
  onMediaUploaded: (url: string, type: "image" | "video") => void;
  onMediaCleared: () => void;
  previewUrl: string | null;
  mediaType: "image" | "video" | null;
  isUploading: boolean;
  setIsUploading: (loading: boolean) => void;
}

const ChatMediaUpload = ({
  onMediaUploaded,
  onMediaCleared,
  previewUrl,
  mediaType,
  isUploading,
  setIsUploading,
}: ChatMediaUploadProps) => {
  const { toast } = useToast();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "image" | "video"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (type === "image" && !file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    if (type === "video" && !file.type.startsWith("video/")) {
      toast({
        title: "Invalid file type",
        description: "Please select a video file",
        variant: "destructive",
      });
      return;
    }

    // Size limits: 10MB for images, 50MB for videos
    const maxSize = type === "image" ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: `Maximum file size is ${type === "image" ? "10MB" : "50MB"}`,
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        toast({
          title: "Not authenticated",
          description: "Please log in to upload files",
          variant: "destructive",
        });
        setIsUploading(false);
        return;
      }

      const fileExt = file.name.split(".").pop();
      const fileName = `${session.user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-images")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("chat-images").getPublicUrl(fileName);
      onMediaUploaded(urlData.publicUrl, type);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="file"
        ref={imageInputRef}
        onChange={(e) => handleFileSelect(e, "image")}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={videoInputRef}
        onChange={(e) => handleFileSelect(e, "video")}
        accept="video/*"
        className="hidden"
      />
      
      {previewUrl ? (
        <div className="relative">
          {mediaType === "video" ? (
            <video
              src={previewUrl}
              className="h-10 w-10 object-cover rounded-lg"
            />
          ) : (
            <img
              src={previewUrl}
              alt="Preview"
              className="h-10 w-10 object-cover rounded-lg"
            />
          )}
          <button
            onClick={onMediaCleared}
            className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => imageInputRef.current?.click()}
            disabled={isUploading}
            className="h-9 w-9 rounded-full"
          >
            {isUploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Image className="h-5 w-5 text-muted-foreground" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => videoInputRef.current?.click()}
            disabled={isUploading}
            className="h-9 w-9 rounded-full text-destructive"
          >
            <Video className="h-5 w-5" />
          </Button>
        </>
      )}
    </div>
  );
};

export default ChatMediaUpload;
