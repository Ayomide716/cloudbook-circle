import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Camera, Image, Loader2, X } from "lucide-react";
import { cn, getErrorMessage } from "@/lib/utils";

interface ImageUploadProps {
  bucket: string;
  userId: string;
  onUploadComplete: (url: string) => void;
  currentImage?: string;
  label?: string;
  /**
   * "icon" (default): small image button that shows a preview after upload (post composers).
   * "pill": labelled frosted button, no preview (e.g. "Edit cover").
   * "avatar": round camera button for profile photos, no preview.
   */
  variant?: "icon" | "pill" | "avatar";
  className?: string;
  /** Icon variant only: set false when the parent renders its own preview (e.g. the post composer). */
  showPreview?: boolean;
}

const ImageUpload = ({ bucket, userId, onUploadComplete, currentImage, label = "Upload Image", variant = "icon", className, showPreview: showPreviewProp = true }: ImageUploadProps) => {
  // Unique per instance: two uploaders for the same bucket (cover + avatar) must not share an id.
  const inputId = `file-upload-${bucket}-${useId()}`;
  const showPreview = variant === "icon" && showPreviewProp;
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentImage || null);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB",
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

    } catch (error) {
      toast({
        title: "Upload failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const clearImage = () => {
    setPreview(null);
    onUploadComplete("");
  };

  return (
    <div className="space-y-2">
      {showPreview && preview ? (
        <div className="relative">
          <img
            src={preview}
            alt="Preview"
            className="w-full max-h-64 object-cover rounded-lg"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2"
            onClick={clearImage}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div>
          <Input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={isUploading}
            className="hidden"
            id={inputId}
          />
          <label htmlFor={inputId} className="cursor-pointer">
            {variant === "pill" ? (
              <span className={cn("inline-flex items-center gap-2 h-9 px-3.5 rounded-full glass-strong text-sm font-medium shadow-sm hover:bg-card transition-colors", className)}>
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {label}
              </span>
            ) : variant === "avatar" ? (
              <span
                className={cn("flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground border-2 border-card shadow-md ring-1 ring-border hover:bg-secondary transition-colors", className)}
                aria-label={label}
                title={label}
              >
                {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </span>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn("h-9 w-9 rounded-full text-green-500 hover:bg-green-500/10", className)}
                disabled={isUploading}
                aria-label={label}
                asChild
              >
                <span>
                  {isUploading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Image className="h-5 w-5" />
                  )}
                </span>
              </Button>
            )}
          </label>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;