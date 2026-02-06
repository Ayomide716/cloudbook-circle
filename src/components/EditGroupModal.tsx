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

    const fileExt = newImage.name.split(".").pop();
    const fileName = `${group.id}-${Date.now()}.${fileExt}`;
    const filePath = `group-logos/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, newImage, { upsert: true });

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

      const { error } = await supabase
        .from("groups")
        .update({
          name,
          description: description || null,
          image_url: imageUrl,
        })
        .eq("id", group.id);

      if (error) throw error;

      toast({ title: "Group updated successfully!" });
      onGroupUpdated();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Error updating group",
        description: error.message,
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
          <DialogTitle>Edit Group</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Group Logo */}
          <div className="space-y-2">
            <Label>Group Logo</Label>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
            <div
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
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Group Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter group name"
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
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditGroupModal;
