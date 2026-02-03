import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Image, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChatImageUploadProps {
  onImageUploaded: (url: string) => void;
  onImageCleared: () => void;
  previewUrl: string | null;
  isUploading: boolean;
  setIsUploading: (loading: boolean) => void;
}

const ChatImageUpload = ({
  onImageUploaded,
  onImageCleared,
  previewUrl,
  isUploading,
  setIsUploading,
}: ChatImageUploadProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast({
        title: "Invalid file type",
        description: "Please select an image or video file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10MB",
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
          description: "Please log in to upload images",
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
      onImageUploaded(urlData.publicUrl);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex items-center">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="image/*,video/*"
        className="hidden"
      />
      
      {previewUrl ? (
        <div className="relative">
          <img
            src={previewUrl}
            alt="Preview"
            className="h-10 w-10 object-cover rounded-lg"
          />
          <button
            onClick={onImageCleared}
            className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="h-9 w-9 rounded-full"
        >
          {isUploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Image className="h-5 w-5 text-muted-foreground" />
          )}
        </Button>
      )}
    </div>
  );
};

export default ChatImageUpload;
