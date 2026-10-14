import { LONG_CACHE, shrinkImage } from "@/lib/image-compress";
import { useState, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Images, Loader2, X } from "lucide-react";
import { getErrorMessage } from "@/lib/utils";

interface MultiImageUploadProps {
  bucket: string;
  userId: string;
  onUploadComplete: (urls: string[]) => void;
  currentImages: string[];
  /** Set false when the parent renders its own preview (e.g. the post composer). */
  showPreview?: boolean;
  maxImages?: number;
}

const MultiImageUpload = ({ bucket, userId, onUploadComplete, currentImages, maxImages = 10, showPreview = true }: MultiImageUploadProps) => {
  const inputId = `multi-image-upload-${useId()}`;
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Clear the input so picking the same photo again still fires a change.
    e.target.value = "";
    if (files.length === 0) return;

    const remaining = maxImages - currentImages.length;
    if (files.length > remaining) {
      toast({
        title: `Up to ${maxImages} photos per post`,
        description: remaining > 0 ? `You can add ${remaining} more.` : undefined,
        variant: "destructive",
      });
      return;
    }

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast({ title: "Only image files allowed", variant: "destructive" });
        return;
      }
      // Photos are shrunk before upload, so big camera photos are fine.
      if (file.size > 25 * 1024 * 1024) {
        toast({ title: "Each image must be under 25MB", variant: "destructive" });
        return;
      }
    }

    setIsUploading(true);

    try {
      // Upload together, keeping the order the photos were picked in.
      const newUrls = await Promise.all(
        files.map(async (picked) => {
          const file = await shrinkImage(picked);
          const fileExt = file.name.split(".").pop();
          const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
          const { error } = await supabase.storage.from(bucket).upload(fileName, file, { cacheControl: LONG_CACHE, contentType: file.type });
          if (error) throw error;
          return supabase.storage.from(bucket).getPublicUrl(fileName).data.publicUrl;
        })
      );

      onUploadComplete([...currentImages, ...newUrls]);
    } catch (error) {
      toast({ title: "Upload failed", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = (index: number) => {
    const updated = currentImages.filter((_, i) => i !== index);
    onUploadComplete(updated);
  };

  return (
    <div className="space-y-2">
      {showPreview && currentImages.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {currentImages.map((url, i) => (
            <div key={i} className="relative rounded-lg overflow-hidden aspect-square">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6"
                onClick={() => removeImage(i)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {currentImages.length < maxImages && (
        <div>
          <Input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesChange}
            disabled={isUploading}
            className="hidden"
            id={inputId}
          />
          <label htmlFor={inputId} aria-label="Add photos">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-primary hover:bg-primary/10"
              disabled={isUploading}
              asChild
            >
              <span>
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Images className="h-5 w-5" />
                )}
              </span>
            </Button>
          </label>
        </div>
      )}
    </div>
  );
};

export default MultiImageUpload;
