import { IMAGE_SIZES, LONG_CACHE, shrinkImage } from "@/lib/image-compress";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ImagePlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/utils";

interface EditGroupModalProps {
  group: {
    id: string;
    name: string;
    description: string | null;
    image_url: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupUpdated: () => void;
}

const EditGroupModal = ({ group, open, onOpenChange, onGroupUpdated }: EditGroupModalProps) => {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || "");
  const [imagePreview, setImagePreview] = useState<string | null>(group.image_url);
  const [newImage, setNewImage] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Each time it opens, start from the group as it is now (not what was typed last time).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(group.name);
      setDescription(group.description || "");
      setImagePreview(group.image_url);
      setNewImage(null);
    }
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!newImage) return group.image_url;

    const small = await shrinkImage(newImage, IMAGE_SIZES.avatar);
    const fileExt = small.name.split(".").pop();
    const fileName = `${group.id}-${Date.now()}.${fileExt}`;
    const filePath = `group-logos/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, small, { upsert: true, cacheControl: LONG_CACHE, contentType: small.type });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      toast({
        title: "Image upload failed",
        description: uploadError.message,
        variant: "destructive",
      });
      return group.image_url;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let imageUrl = group.image_url;
      
      if (newImage) {
        imageUrl = await uploadImage();
      }

      // Group admins can change these too, not only whoever made the group.
      const { error } = await supabase.rpc("update_group_details", {
        _group: group.id,
        _name: name,
        _description: description || null,
        _image_url: imageUrl,
      });
      if (error && /Could not find the function/i.test(error.message)) {
        // Before the database update: the creator can still change it directly.
        const { error: direct } = await supabase
          .from("groups")
          .update({ name, description: description || null, image_url: imageUrl })
          .eq("id", group.id);
        if (direct) throw direct;
      } else if (error) {
        throw error;
      }

      onGroupUpdated();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Error updating group",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit group</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Group Logo */}
          <div className="space-y-2">
            <Label>Group photo</Label>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            <button
              type="button"
              aria-label="Change group photo"
              onClick={() => fileInputRef.current?.click()}
              className="relative h-24 w-24 mx-auto rounded-full border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors cursor-pointer overflow-hidden bg-secondary/50 flex items-center justify-center"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center">
                  <ImagePlus className="h-6 w-6 mx-auto text-muted-foreground/50" />
                  <span className="text-xs text-muted-foreground">Change</span>
                </div>
              )}
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Group name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter group name"
              maxLength={100}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group about?"
              className="min-h-[100px]"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditGroupModal;
