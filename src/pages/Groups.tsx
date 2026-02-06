import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/Navigation";
import BottomNav from "@/components/BottomNav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Users, Search, Globe, ImagePlus } from "lucide-react";

interface Group {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  created_by: string;
  member_count?: number;
  is_member?: boolean;
}

const Groups = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupImage, setGroupImage] = useState<File | null>(null);
  const [groupImagePreview, setGroupImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });

  useEffect(() => {
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    if (currentUserId) {
      loadGroups();
    }
  }, [currentUserId]);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    setCurrentUserId(session.user.id);
  };

  const loadGroups = async () => {
    if (!currentUserId) return;
    setIsLoading(true);

    const { data: groupsData, error } = await supabase
      .from("groups" as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error loading groups",
        description: error.message,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    // Load member counts and membership status for each group
    const groupsWithCounts = await Promise.all(
      (groupsData || []).map(async (group: any) => {
        const [countResult, membershipResult] = await Promise.all([
          supabase
            .from("group_members" as any)
            .select("*", { count: "exact", head: true })
            .eq("group_id", group.id),
          supabase
            .from("group_members" as any)
            .select("id")
            .eq("group_id", group.id)
            .eq("user_id", currentUserId)
            .maybeSingle()
        ]);

        return { 
          ...group, 
          member_count: countResult.count || 0,
          is_member: !!membershipResult.data
        };
      })
    );

    setGroups(groupsWithCounts as any);
    setIsLoading(false);
  };

  // Filter groups based on search query
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    
    const query = searchQuery.toLowerCase();
    return groups.filter(group => 
      group.name.toLowerCase().includes(query) ||
      group.description?.toLowerCase().includes(query)
    );
  }, [groups, searchQuery]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setGroupImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setGroupImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadGroupImage = async (groupId: string): Promise<string | null> => {
    if (!groupImage) return null;

    const fileExt = groupImage.name.split(".").pop();
    const fileName = `${groupId}-${Date.now()}.${fileExt}`;
    const filePath = `group-logos/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, groupImage, { upsert: true });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      toast({
        title: "Image upload failed",
        description: uploadError.message,
        variant: "destructive",
      });
      return null;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUserId) return;
    setIsUploading(true);

    const { data, error } = await supabase
      .from("groups" as any)
      .insert({
        name: formData.name,
        description: formData.description,
        created_by: currentUserId,
      } as any)
      .select()
      .single();

    if (error) {
      toast({
        title: "Error creating group",
        description: error.message,
        variant: "destructive",
      });
      setIsUploading(false);
      return;
    }

    const groupId = (data as any).id;

    // Upload image if selected
    if (groupImage) {
      const imageUrl = await uploadGroupImage(groupId);
      if (imageUrl) {
        await supabase
          .from("groups" as any)
          .update({ image_url: imageUrl } as any)
          .eq("id", groupId);
      }
    }

    // Add creator as admin member
    await supabase
      .from("group_members" as any)
      .insert({
        group_id: groupId,
        user_id: currentUserId,
        role: "admin",
      } as any);

    toast({
      title: "Group created successfully",
    });
    setIsCreating(false);
    setFormData({ name: "", description: "" });
    setGroupImage(null);
    setGroupImagePreview(null);
    setIsUploading(false);
    loadGroups();
  };

  const handleJoinGroup = async (e: React.MouseEvent, groupId: string) => {
    e.stopPropagation();
    
    if (!currentUserId) return;

    const { error } = await supabase
      .from("group_members" as any)
      .insert({
        group_id: groupId,
        user_id: currentUserId,
        role: "member",
      } as any);

    if (error) {
      toast({
        title: "Error joining group",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    // Verify membership before navigating
    const { data: memberCheck } = await supabase
      .from("group_members" as any)
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (memberCheck) {
      toast({
        title: "Joined group successfully!",
      });
      navigate(`/groups/${groupId}`);
    } else {
      toast({
        title: "Joined group successfully!",
      });
      loadGroups();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation currentUserId={currentUserId || undefined} />
        <div className="flex items-center justify-center h-[calc(100vh-56px)]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-4">
      <Navigation currentUserId={currentUserId || undefined} />
      
      <div className="max-w-[1200px] mx-auto px-4 lg:px-6 py-4 sm:py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Groups</h1>
              <p className="text-sm text-muted-foreground">{groups.length} groups available</p>
            </div>
          </div>
          <Button onClick={() => setIsCreating(true)} className="sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Create Group
          </Button>
        </div>

        {/* Search Bar - Facebook Style */}
        <Card className="p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 text-base bg-secondary border-0 focus-visible:ring-1"
            />
          </div>
          {searchQuery && (
            <p className="text-sm text-muted-foreground mt-2">
              {filteredGroups.length} {filteredGroups.length === 1 ? 'group' : 'groups'} found for "{searchQuery}"
            </p>
          )}
        </Card>

        {filteredGroups.length === 0 ? (
          <Card className="p-12 text-center">
            {searchQuery ? (
              <>
                <Search className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
                <h2 className="text-xl font-semibold mb-2">No groups found</h2>
                <p className="text-muted-foreground mb-4">
                  Try a different search term or create a new group
                </p>
                <Button onClick={() => setSearchQuery("")} variant="outline">
                  Clear search
                </Button>
              </>
            ) : (
              <>
                <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
                <h2 className="text-xl font-semibold mb-2">No groups yet</h2>
                <p className="text-muted-foreground mb-4">
                  Create a group to connect with people who share your interests
                </p>
                <Button onClick={() => setIsCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Group
                </Button>
              </>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGroups.map((group) => (
              <Card
                key={group.id}
                className="overflow-hidden hover:shadow-lg transition-all cursor-pointer group"
                onClick={() => navigate(`/groups/${group.id}`)}
              >
                {/* Group Card with Avatar */}
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    {/* Group Avatar */}
                    <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {group.image_url ? (
                        <img
                          src={group.image_url}
                          alt={group.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <Users className="h-7 w-7 text-primary/50" />
                      )}
                    </div>
                    
                    {/* Group Name & Members */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold truncate group-hover:text-primary transition-colors">
                        {group.name}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        <span>{group.member_count || 0} members</span>
                        <span>·</span>
                        <Globe className="h-3.5 w-3.5" />
                        <span>Public</span>
                      </div>
                    </div>
                  </div>
                  
                  {group.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {group.description}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-end">
                    {!group.is_member && (
                      <Button
                        size="sm"
                        onClick={(e) => handleJoinGroup(e, group.id)}
                      >
                        Join
                      </Button>
                    )}
                    {group.is_member && (
                      <span className="text-xs text-primary font-medium px-2 py-1 bg-primary/10 rounded-full">
                        Member
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BottomNav currentUserId={currentUserId || undefined} />

      {/* Create Group Dialog */}
      <Dialog open={isCreating} onOpenChange={(open) => {
        setIsCreating(open);
        if (!open) {
          setGroupImage(null);
          setGroupImagePreview(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Group</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleCreateGroup} className="space-y-4">
            {/* Group Logo Upload */}
            <div className="space-y-2">
              <Label>Group Logo (optional)</Label>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="relative h-32 w-32 mx-auto rounded-xl border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors cursor-pointer overflow-hidden bg-secondary/50 flex items-center justify-center"
              >
                {groupImagePreview ? (
                  <img src={groupImagePreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center">
                    <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <span className="text-xs text-muted-foreground mt-1 block">Add logo</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Group Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter group name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What is this group about?"
                className="min-h-[100px]"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreating(false)}
                disabled={isUploading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isUploading}>
                {isUploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create Group
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Groups;
