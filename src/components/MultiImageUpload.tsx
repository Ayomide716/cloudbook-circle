import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Images, Loader2, X } from "lucide-react";

interface MultiImageUploadProps {
  bucket: string;
  userId: string;
  onUploadComplete: (urls: string[]) => void;
  currentImages: string[];
  maxImages?: number;
}

const MultiImageUpload = ({ bucket, userId, onUploadComplete, currentImages, maxImages = 10 }: MultiImageUploadProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remaining = maxImages - currentImages.length;
    if (files.length > remaining) {
      toast({ title: `Max ${maxImages} images allowed`, variant: "destructive" });
      return;
    }

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast({ title: "Only image files allowed", variant: "destructive" });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Each image must be under 5MB", variant: "destructive" });
        return;
      }
    }

    setIsUploading(true);
    const newUrls: string[] = [];

    try {
      for (const file of files) {
        const fileExt = file.name.split(".").pop();
        const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

        const { error } = await supabase.storage.from(bucket).upload(fileName, file);
        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(fileName);
        newUrls.push(publicUrl);
      }

      onUploadComplete([...currentImages, ...newUrls]);
      toast({ title: `${newUrls.length} image(s) uploaded` });
    } catch (error: any) {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
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
      {currentImages.length > 0 && (
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
            id="multi-image-upload"
          />
          <label htmlFor="multi-image-upload">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-blue-500 hover:bg-blue-500/10"
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
